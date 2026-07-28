# Live provider-swap analysis

Run completed on 2026-07-28 with the same ten cases, system prompt, scorers, invocation boundary, and 25-second request timeout for both providers. Each provider ran the dataset three times. The raw evidence is preserved in [`live-latest.json`](./live-latest.json).

## Result

| Provider and model | Passed | Completed requests | Valid terminal outcomes | Timeouts | Error chunks | p50 | p95 |
|---|---:|---:|---:|---:|---:|---:|---:|
| OpenRouter — `openai/gpt-oss-20b:free` | 28/30 (93.3%) | 28/30 | 28/30 | 2 | 0 | 5,342 ms | 25,002 ms |
| Gemini API — `gemini-3.5-flash-lite` | 26/30 (86.7%) | 30/30 | 30/30 | 0 | 1 | 776 ms | 11,245 ms |

Neither adapter mutated an input. No stream-level exception occurred. OpenRouter reported token usage for 28 completed requests: 3,171 prompt tokens and 4,180 completion tokens. Gemini reported usage for 29 requests: 1,204 prompt tokens and 127 completion tokens.

Cost remains `null` in the raw result. Both selected models were advertised as free-tier options at execution time, but advertised pricing is not the same as a verified billing result. Any publication must identify that distinction and cite a dated pricing source:

- [OpenRouter model page](https://openrouter.ai/openai/gpt-oss-20b%3Afree/api)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)

## What failed

| Provider | Repetition | Case | Observed behavior |
|---|---:|---|---|
| OpenRouter | 1 | Reverse `AgentKit` preserving case | Timed out at 25,002 ms; no explicit terminal chunk |
| OpenRouter | 3 | Reverse `AgentKit` preserving case | Timed out at 25,002 ms; no explicit terminal chunk |
| Gemini | 1 | Reverse `AgentKit` preserving case | Returned `tiktnegA`; expected `tiKtnegA` |
| Gemini | 2 | Number sequence | Returned an explicit error terminal and no answer |
| Gemini | 2 | Reverse `AgentKit` preserving case | Returned `tiKnegA`; expected `tiKtnegA` |
| Gemini | 3 | Reverse `AgentKit` preserving case | Returned `tiktnegA`; expected `tiKtnegA` |

OpenRouter answered all 28 completed requests correctly, but two requests never reached a valid terminal state before the timeout. Gemini completed all 30 streams with a valid terminal outcome, including one explicit error, but passed 26 tasks and repeatedly failed the case-sensitive reversal.

## Interpretation

The adapter swap was syntactically successful and operationally different.

The architecture result is the strongest and most defensible claim: the same evaluation ran through two independent provider adapters without changing the dataset, prompt, scorers, or calling code, and without mutating inputs. The abstraction preserved the application boundary.

The live result shows what that abstraction does not erase:

- **Availability and terminal behavior:** OpenRouter produced two timeouts without a valid terminal event; Gemini produced no timeout and represented its failed request with an explicit error terminal.
- **Semantic accuracy:** OpenRouter passed every completed request. Gemini was faster but repeatedly missed the exact case-preserving transformation.
- **Latency:** Gemini had substantially lower median and tail latency in this run. OpenRouter's p95 reached the experiment timeout.

This is not a model leaderboard and does not establish a general winner. It is a small, constrained dataset, run three times on free tiers under real network and queue conditions. It does show why provider portability should preserve differences rather than hide them: once the application boundary is stable, the same evaluation can expose provider-specific reliability, latency, and output behavior without an application rewrite.

## Proposed article thesis

> A provider swap can be syntactically successful and operationally different. A useful adapter boundary does not promise identical providers; it makes their differences measurable without forcing those differences through the rest of the application.

Suggested first-person lead:

> I expected the adapter swap to be the easy part. It was. The surprising part was that the same ten cases exposed two different failure profiles without changing the evaluation.

## Publication limitations

- Ten constrained instruction-following and reasoning cases are not representative of broad model quality.
- Three repetitions reveal variance but are not enough for statistical generalization.
- Latency includes network conditions and provider queue time.
- The selected OpenRouter and Gemini models are not capability-matched.
- Free-tier behavior, availability, routing, limits, and pricing may change.
- The dataset is synthetic and contains no private product or customer data.
- Emerson Braun maintains AgentsKit and must disclose that relationship.

