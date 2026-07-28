import assert from 'node:assert/strict'
import test from 'node:test'
import { runExperiment } from './experiment.mjs'

test('deterministic provider swap preserves the evaluation boundary', async () => {
  const result = await runExperiment({ mode: 'deterministic' })

  assert.equal(result.providers.length, 2)
  assert.deepEqual(result.controls, {
    sameDataset: true,
    sameSystemPrompt: true,
    sameScorers: true,
    sameInvocationBoundary: true,
    providerSpecificPrompting: false,
    requestTimeoutMs: 25_000,
  })

  for (const provider of result.providers) {
    assert.equal(provider.summary.passRate, 1)
    assert.deepEqual(provider.summary.terminalCorrectness, { valid: 10, total: 10 })
    assert.equal(provider.summary.inputMutationFailures, 0)
    assert.equal(provider.summary.errorChunks, 0)
    assert.equal(provider.summary.requestTimeouts, 0)
    assert.equal(provider.summary.streamErrors, 0)
  }
})

test('live mode refuses to produce evidence with fewer than two providers', async () => {
  await assert.rejects(
    runExperiment({ mode: 'live', env: { REPETITIONS: '1' } }),
    /at least two independent adapters/,
  )
})
