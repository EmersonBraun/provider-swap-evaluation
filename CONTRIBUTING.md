# Contributing

Contributions that make the comparison more reproducible, inspectable, or representative are welcome.

Useful contributions include:

- new provider adapters that preserve the shared invocation boundary;
- additional synthetic cases with an explicit scorer and rationale;
- statistical summaries for larger repeated runs;
- portable evidence-verification scripts;
- accessibility improvements to the generated visuals;
- corrections to the methodology, analysis, or limitations.

## Experimental integrity

A pull request must not:

- remove or hide failed runs;
- tune a shared prompt for only one provider;
- replace an explicit model ID with a changing default or router;
- add credentials, private prompts, customer data, or private product behavior;
- infer cost without usage evidence and a dated pricing source;
- describe a small run as a general model leaderboard.

When adding live evidence, preserve the raw machine-readable result and record the provider, model ID, date, repetition count, timeout, package versions, and known limitations.

## Local checks

```bash
npm ci
npm test
npm run visuals
git diff --exit-code -- visuals
```

Open an issue before proposing a change to the shared controls or result schema so the methodological trade-off can be discussed separately from the implementation.
