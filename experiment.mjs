import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gemini, mockAdapter, ollama, openrouter } from '@agentskit/adapters'
import { runEval } from '@agentskit/eval'

const root = dirname(fileURLToPath(import.meta.url))

export async function loadDataset() {
  return JSON.parse(await readFile(resolve(root, 'cases.json'), 'utf8'))
}

function normalize(value) {
  return value.trim().replace(/\s+/g, ' ')
}

function scorer(testCase) {
  if (testCase.scorer === 'json') {
    return (output) => {
      try {
        return JSON.stringify(JSON.parse(output)) === JSON.stringify(testCase.expected)
      } catch {
        return false
      }
    }
  }

  if (testCase.scorer === 'exact-case-insensitive') {
    return (output) => normalize(output).toLowerCase() === normalize(String(testCase.expected)).toLowerCase()
  }

  return (output) => normalize(output) === normalize(String(testCase.expected))
}

function message(content, index) {
  return {
    id: `message-${index}`,
    role: 'user',
    content,
    status: 'complete',
    createdAt: new Date(0),
  }
}

export async function invokeAdapter(adapter, systemPrompt, input, timeoutMs = 25_000) {
  const messages = [
    { ...message(systemPrompt, 0), role: 'system' },
    message(input, 1),
  ]
  const before = JSON.stringify(messages)
  const source = adapter.createSource({ messages })
  const chunks = []
  let content = ''
  let usage
  let requestTimedOut = false
  let streamError = null
  const timeout = setTimeout(() => {
    requestTimedOut = true
    source.abort()
  }, timeoutMs)

  try {
    for await (const chunk of source.stream()) {
      chunks.push(chunk)
      if (chunk.type === 'text') content += chunk.content ?? ''
      if (chunk.type === 'usage' && chunk.usage) usage = chunk.usage
    }
  } catch (error) {
    streamError = error instanceof Error ? error.message : String(error)
  } finally {
    clearTimeout(timeout)
    source.abort()
  }

  return {
    content: requestTimedOut || streamError ? '' : content,
    tokenUsage: usage
      ? { prompt: usage.promptTokens, completion: usage.completionTokens }
      : undefined,
    diagnostics: {
      inputMutated: JSON.stringify(messages) !== before,
      chunkCount: chunks.length,
      terminalType: chunks.at(-1)?.type ?? null,
      errorChunks: chunks.filter(chunk => chunk.type === 'error').length,
      usageReported: Boolean(usage),
      requestTimedOut,
      streamError,
    },
  }
}

function suiteFrom(dataset) {
  return {
    name: dataset.name,
    cases: dataset.cases.map(testCase => ({
      input: testCase.input,
      expected: scorer(testCase),
      metadata: { id: testCase.id, scorer: testCase.scorer },
    })),
  }
}

function percentile(values, percentage) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentage) - 1)]
}

function summarize(runs) {
  const results = runs.flatMap(run => run.eval.results)
  const diagnostics = runs.flatMap(run => run.diagnostics)
  const tokenUsage = results
    .map(result => result.tokenUsage)
    .filter(Boolean)

  return {
    repetitions: runs.length,
    cases: results.length,
    passed: results.filter(result => result.passed).length,
    passRate: results.length === 0 ? 0 : results.filter(result => result.passed).length / results.length,
    latencyMs: {
      p50: percentile(results.map(result => result.latencyMs), 0.5),
      p95: percentile(results.map(result => result.latencyMs), 0.95),
    },
    terminalCorrectness: {
      valid: diagnostics.filter(item => ['done', 'error'].includes(item.terminalType)).length,
      total: diagnostics.length,
    },
    inputMutationFailures: diagnostics.filter(item => item.inputMutated).length,
    errorChunks: diagnostics.reduce((total, item) => total + item.errorChunks, 0),
    requestTimeouts: diagnostics.filter(item => item.requestTimedOut).length,
    streamErrors: diagnostics.filter(item => item.streamError).length,
    tokenUsage: tokenUsage.length === 0
      ? null
      : {
          prompt: tokenUsage.reduce((total, item) => total + item.prompt, 0),
          completion: tokenUsage.reduce((total, item) => total + item.completion, 0),
          reportedCases: tokenUsage.length,
        },
    costUsd: null,
    costNote: 'Cost remains null unless a reproducible model-specific pricing snapshot is added to the evidence.',
  }
}

async function runAdapter(name, adapter, dataset, repetitions, timeoutMs) {
  const runs = []

  for (let repetition = 0; repetition < repetitions; repetition += 1) {
    const diagnostics = []
    const evalResult = await runEval({
      suite: suiteFrom(dataset),
      agent: async (input) => {
        process.stdout.write(`[${name}] repetition ${repetition + 1}/${repetitions}: ${input.slice(0, 48)}\n`)
        const result = await invokeAdapter(adapter, dataset.systemPrompt, input, timeoutMs)
        diagnostics.push({ input, ...result.diagnostics })
        return {
          content: result.content,
          tokenUsage: result.tokenUsage,
        }
      },
    })
    runs.push({ repetition: repetition + 1, eval: evalResult, diagnostics })
  }

  return { name, summary: summarize(runs), runs }
}

function deterministicAdapters(dataset) {
  const expectedByInput = new Map(dataset.cases.map(testCase => [
    testCase.input,
    typeof testCase.expected === 'string' ? testCase.expected : JSON.stringify(testCase.expected),
  ]))

  const responseFor = request => {
    const input = request.messages.at(-1)?.content ?? ''
    return expectedByInput.get(input) ?? ''
  }

  return [
    {
      name: 'deterministic-single-chunk',
      adapter: mockAdapter({
        response: request => [
          { type: 'text', content: responseFor(request) },
          { type: 'done' },
        ],
      }),
    },
    {
      name: 'deterministic-multi-chunk',
      adapter: mockAdapter({
        response: request => {
          const output = responseFor(request)
          const splitAt = Math.max(1, Math.floor(output.length / 2))
          return [
            { type: 'text', content: output.slice(0, splitAt), metadata: { provider: 'fixture-b' } },
            { type: 'text', content: output.slice(splitAt) },
            { type: 'done', metadata: { finishReason: 'stop' } },
          ]
        },
      }),
    },
  ]
}

function liveAdapters(env) {
  const adapters = []

  if (env.OPENROUTER_API_KEY && env.OPENROUTER_MODEL) {
    adapters.push({
      name: `openrouter:${env.OPENROUTER_MODEL}`,
      adapter: openrouter({ apiKey: env.OPENROUTER_API_KEY, model: env.OPENROUTER_MODEL }),
    })
  }

  if (env.GEMINI_API_KEY && env.GEMINI_MODEL) {
    adapters.push({
      name: `gemini:${env.GEMINI_MODEL}`,
      adapter: gemini({ apiKey: env.GEMINI_API_KEY, model: env.GEMINI_MODEL }),
    })
  }

  if (env.OLLAMA_MODEL) {
    adapters.push({
      name: `ollama:${env.OLLAMA_MODEL}`,
      adapter: ollama({ model: env.OLLAMA_MODEL, baseUrl: env.OLLAMA_BASE_URL }),
    })
  }

  if (adapters.length < 2) {
    throw new Error('Live mode requires at least two independent adapters. Configure OpenRouter, Gemini, or Ollama in .env.')
  }

  return adapters
}

export async function runExperiment({ mode, env = process.env }) {
  const dataset = await loadDataset()
  const adapters = mode === 'live' ? liveAdapters(env) : deterministicAdapters(dataset)
  const repetitions = mode === 'live' ? Number.parseInt(env.REPETITIONS ?? '3', 10) : 1
  const timeoutMs = mode === 'live' ? Number.parseInt(env.REQUEST_TIMEOUT_MS ?? '25000', 10) : 25_000

  if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 20) {
    throw new Error('REPETITIONS must be an integer between 1 and 20.')
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 120_000) {
    throw new Error('REQUEST_TIMEOUT_MS must be an integer between 1000 and 120000.')
  }

  const providers = []
  for (const candidate of adapters) {
    providers.push(await runAdapter(candidate.name, candidate.adapter, dataset, repetitions, timeoutMs))
  }

  return {
    schemaVersion: 1,
    experiment: 'Can your agent evaluation survive a provider swap?',
    mode,
    generatedAt: new Date().toISOString(),
    dataset: {
      name: dataset.name,
      caseCount: dataset.cases.length,
      scorers: [...new Set(dataset.cases.map(testCase => testCase.scorer))],
    },
    controls: {
      sameDataset: true,
      sameSystemPrompt: true,
      sameScorers: true,
      sameInvocationBoundary: true,
      providerSpecificPrompting: false,
      requestTimeoutMs: timeoutMs,
    },
    providers,
    limitations: [
      'The deterministic baseline validates the evaluation boundary, not model quality.',
      'Live quality claims require at least two independent providers and repeated runs.',
      'Latency includes network and provider queue time.',
      'Cost is not inferred when usage or a dated pricing snapshot is unavailable.',
      'The dataset is intentionally small and tests constrained reasoning and instruction following, not domain expertise.',
    ],
  }
}

async function main() {
  const mode = process.argv.includes('--live') ? 'live' : 'deterministic'
  const result = await runExperiment({ mode })
  const output = resolve(root, 'results', `${mode}-latest.json`)
  await mkdir(dirname(output), { recursive: true })
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ output, providers: result.providers.map(provider => provider.summary) }, null, 2)}\n`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main()
}
