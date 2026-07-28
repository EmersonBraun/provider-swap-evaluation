import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const result = JSON.parse(await readFile(resolve(root, 'results/live-latest.json'), 'utf8'))
const [openrouter, gemini] = result.providers
const outputDirectory = resolve(root, 'visuals')

await mkdir(outputDirectory, { recursive: true })

const colors = {
  ink: '#101828',
  muted: '#475467',
  line: '#d0d5dd',
  panel: '#f8fafc',
  blue: '#2563eb',
  orange: '#d97706',
  green: '#059669',
  red: '#dc2626',
  white: '#ffffff',
}

function svgFrame(width, height, title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">${title}</title>
  <desc id="description">${description}</desc>
  <rect width="${width}" height="${height}" fill="${colors.white}"/>
  <style>
    text { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; fill: ${colors.ink}; }
    .title { font-size: 30px; font-weight: 700; }
    .subtitle { font-size: 16px; fill: ${colors.muted}; }
    .label { font-size: 16px; font-weight: 650; }
    .small { font-size: 14px; fill: ${colors.muted}; }
    .metric { font-size: 22px; font-weight: 700; }
  </style>
  <text x="48" y="56" class="title">${title}</text>
  ${body}
</svg>
`
}

function box(x, y, width, height, label, note, stroke = colors.line) {
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${colors.panel}" stroke="${stroke}" stroke-width="2"/>
  <text x="${x + width / 2}" y="${y + 34}" text-anchor="middle" class="label">${label}</text>
  <text x="${x + width / 2}" y="${y + 59}" text-anchor="middle" class="small">${note}</text>`
}

const boundary = svgFrame(
  1200,
  650,
  'One evaluation boundary, two provider paths',
  'The dataset, prompt, scorers, and invocation remain unchanged while separate adapters connect to OpenRouter and Gemini.',
  `<text x="48" y="88" class="subtitle">Only the adapter configuration changes. Evaluation inputs and outputs keep the same contract.</text>
  ${box(60, 150, 230, 90, 'Dataset', '10 synthetic cases')}
  ${box(350, 150, 230, 90, 'Evaluation', 'shared prompt + scorers')}
  ${box(640, 150, 230, 90, 'Adapter contract', 'stream + abort + terminal')}
  <path d="M290 195 H350 M580 195 H640" stroke="${colors.ink}" stroke-width="3" marker-end="url(#arrow)"/>
  <path d="M755 240 V310 H440 V350 M755 310 H1000 V350" fill="none" stroke="${colors.ink}" stroke-width="3"/>
  ${box(325, 350, 230, 90, 'OpenRouter', 'gpt-oss-20b:free', colors.blue)}
  ${box(885, 350, 230, 90, 'Gemini API', 'gemini-3.5-flash-lite', colors.orange)}
  <path d="M440 440 V505 H720 M1000 440 V505 H720" fill="none" stroke="${colors.ink}" stroke-width="3"/>
  ${box(590, 500, 260, 90, 'Comparable evidence', 'accuracy, terminal, latency')}
  <defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L0,6 L9,3 z" fill="${colors.ink}"/></marker></defs>`,
)

function percentage(value, total) {
  return (value / total) * 100
}

const openPass = percentage(openrouter.summary.passed, openrouter.summary.cases)
const openTerminal = percentage(openrouter.summary.terminalCorrectness.valid, openrouter.summary.terminalCorrectness.total)
const geminiPass = percentage(gemini.summary.passed, gemini.summary.cases)
const geminiTerminal = percentage(gemini.summary.terminalCorrectness.valid, gemini.summary.terminalCorrectness.total)

function horizontalBar(y, label, value, color) {
  const width = value * 5.2
  return `<text x="48" y="${y + 19}" class="label">${label}</text>
  <rect x="260" y="${y}" width="520" height="26" rx="7" fill="#eaecf0"/>
  <rect x="260" y="${y}" width="${width}" height="26" rx="7" fill="${color}"/>
  <text x="800" y="${y + 20}" class="metric">${value.toFixed(1)}%</text>`
}

const comparison = svgFrame(
  1200,
  760,
  'The boundary held; provider behavior differed',
  'Comparison of task pass rate, valid terminal outcomes, and latency for OpenRouter and Gemini across 30 requests each.',
  `<text x="48" y="88" class="subtitle">30 requests per provider · same dataset, prompt, scorers, invocation, and 25-second timeout</text>
  <text x="48" y="140" class="label">Task pass rate</text>
  ${horizontalBar(165, 'OpenRouter', openPass, colors.blue)}
  ${horizontalBar(215, 'Gemini', geminiPass, colors.orange)}
  <text x="48" y="295" class="label">Valid terminal outcomes</text>
  ${horizontalBar(320, 'OpenRouter', openTerminal, colors.blue)}
  ${horizontalBar(370, 'Gemini', geminiTerminal, colors.orange)}
  <line x1="48" y1="450" x2="1152" y2="450" stroke="${colors.line}" stroke-width="2"/>
  <text x="48" y="500" class="label">Latency</text>
  <rect x="48" y="530" width="510" height="150" rx="14" fill="${colors.panel}" stroke="${colors.blue}" stroke-width="2"/>
  <text x="78" y="568" class="label">OpenRouter</text>
  <text x="78" y="610" class="metric">p50 ${openrouter.summary.latencyMs.p50.toLocaleString('en-US')} ms</text>
  <text x="78" y="650" class="metric">p95 ${openrouter.summary.latencyMs.p95.toLocaleString('en-US')} ms</text>
  <rect x="642" y="530" width="510" height="150" rx="14" fill="${colors.panel}" stroke="${colors.orange}" stroke-width="2"/>
  <text x="672" y="568" class="label">Gemini</text>
  <text x="672" y="610" class="metric">p50 ${gemini.summary.latencyMs.p50.toLocaleString('en-US')} ms</text>
  <text x="672" y="650" class="metric">p95 ${gemini.summary.latencyMs.p95.toLocaleString('en-US')} ms</text>
  <text x="48" y="724" class="small">Source: preserved live run generated ${result.generatedAt.slice(0, 10)}. Latency includes network and provider queue time.</text>`,
)

const failureProfiles = svgFrame(
  1200,
  650,
  'Different providers, different failure profiles',
  'OpenRouter completed 28 correct requests and timed out twice. Gemini completed all terminal states but had three strict-output failures and one explicit provider error.',
  `<text x="48" y="88" class="subtitle">A single success rate would hide the distinction between task, terminal, and provider failures.</text>
  <rect x="48" y="135" width="510" height="400" rx="18" fill="${colors.panel}" stroke="${colors.blue}" stroke-width="3"/>
  <text x="84" y="185" class="title">OpenRouter</text>
  <text x="84" y="220" class="subtitle">openai/gpt-oss-20b:free</text>
  <text x="84" y="285" class="metric" fill="${colors.green}">28 correct completions</text>
  <text x="84" y="335" class="metric" fill="${colors.red}">2 request timeouts</text>
  <text x="84" y="385" class="label">28/30 valid terminals</text>
  <text x="84" y="430" class="small">Both timeouts occurred on the same</text>
  <text x="84" y="454" class="small">case-sensitive string reversal case.</text>
  <rect x="642" y="135" width="510" height="400" rx="18" fill="${colors.panel}" stroke="${colors.orange}" stroke-width="3"/>
  <text x="678" y="185" class="title">Gemini</text>
  <text x="678" y="220" class="subtitle">gemini-3.5-flash-lite</text>
  <text x="678" y="285" class="metric" fill="${colors.green}">26 correct completions</text>
  <text x="678" y="335" class="metric" fill="${colors.red}">3 strict-output failures</text>
  <text x="678" y="385" class="metric" fill="${colors.red}">1 explicit provider error</text>
  <text x="678" y="430" class="label">30/30 valid terminals</text>
  <text x="678" y="475" class="small">The explicit error failed the user task</text>
  <text x="678" y="499" class="small">but satisfied the stream contract.</text>
  <text x="48" y="590" class="label">Architectural portability preserved the comparison—it did not erase provider differences.</text>`,
)

await Promise.all([
  writeFile(resolve(outputDirectory, 'evaluation-boundary.svg'), boundary),
  writeFile(resolve(outputDirectory, 'results-comparison.svg'), comparison),
  writeFile(resolve(outputDirectory, 'failure-profiles.svg'), failureProfiles),
])

process.stdout.write('Generated 3 SVG figures from results/live-latest.json\n')
