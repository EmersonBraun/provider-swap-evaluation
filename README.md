# Provider-swap evaluation

A reproducible JavaScript experiment that asks:

> Can the same agent evaluation survive an AI provider swap without changing its dataset, prompt, scorers, or invocation boundary?

The experiment separates two questions that are often collapsed:

1. **Architectural portability:** can the provider adapter change while the evaluation remains unchanged?
2. **Operational behavior:** once the boundary holds, what differences appear in accuracy, terminal states, latency, errors, and timeouts?

This repository contains the complete synthetic dataset, harness, deterministic tests, raw live results, evidence hashes, and original visuals. It contains no API keys, private prompts, customer data, or private product behavior.

## Result

The preserved live run used ten cases, three repetitions per provider, and a 25-second request timeout.

| Provider and model | Passed | Valid terminal outcomes | Timeouts | Error chunks | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|
| OpenRouter — `openai/gpt-oss-20b:free` | 28/30 | 28/30 | 2 | 0 | 5,342 ms | 25,002 ms |
| Gemini API — `gemini-3.5-flash-lite` | 26/30 | 30/30 | 0 | 1 | 776 ms | 11,245 ms |

Neither adapter mutated input messages. No stream-level exception occurred.

The result does not identify a general model winner. It shows that a provider swap can be architecturally successful while exposing different operational failure profiles. See [the manually verified analysis](./results/live-analysis.md) for the failures, interpretation, and limitations.

## Reproduce the deterministic baseline

Requirements:

- Node.js 20.6 or newer;
- npm;
- no provider credentials.

```bash
npm ci
npm test
npm run baseline
```

Expected result:

- 20/20 scored cases pass across two deterministic adapters;
- 20/20 streams have valid terminal outcomes;
- zero input mutations;
- zero errors and timeouts.

The generated output is written to `results/deterministic-latest.json`.

## Run the live comparison

Copy the environment template and provide at least two independent adapter configurations:

```bash
cp .env.example .env
npm run live
```

Supported lanes:

- OpenRouter with an explicit model ID;
- Gemini API with an explicit model ID;
- a local Ollama server with an explicit model ID.

The harness refuses to run with fewer than two adapters or implicit model defaults. `.env` is ignored by Git.

Each request has an explicit timeout. A timeout is preserved as a failed case and invalid terminal outcome instead of leaving the experiment blocked indefinitely.

## Generate the visuals

The SVG figures are generated from the preserved raw result:

```bash
npm run visuals
```

- [Evaluation boundary](./visuals/evaluation-boundary.svg)
- [Results comparison](./visuals/results-comparison.svg)
- [Failure profiles](./visuals/failure-profiles.svg)

## Evidence layout

```text
.
├── cases.json
├── experiment.mjs
├── test.mjs
├── evidence-manifest.json
├── results/
│   ├── deterministic-latest.json
│   ├── live-latest.json
│   └── live-analysis.md
├── scripts/
│   └── generate-visuals.mjs
└── visuals/
```

The [evidence manifest](./evidence-manifest.json) records the exact package versions, execution timestamp, summaries, and SHA-256 hashes from the preserved run.

## Methodological limits

- Ten constrained cases do not represent broad model quality.
- Three repetitions reveal variance but do not support statistical generalization.
- Latency includes network and provider queue time.
- The selected models are not capability-matched.
- Free-tier behavior, availability, routing, and pricing may change.
- Advertised free-tier pricing is not treated as verified billing evidence.
- The dataset is synthetic and contains no private application or customer data.

## Maintainer disclosure

This experiment was created by Emerson Braun, who also created and maintains [AgentsKit](https://github.com/AgentsKit-io/agentskit). It uses the public `@agentskit/adapters` and `@agentskit/eval` packages.

## License

[MIT](./LICENSE)
