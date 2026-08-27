# Eval fixtures

`webmcp-evals.json` is a model-agnostic dataset. It describes the visible app state, full route-specific tool registry, user prompt, expected calls, and safety assertions. It deliberately does not contain model credentials or real personal data.

Validate deterministic structure:

```bash
node tests/evals/validate.mjs
```

An agent harness should translate each case into the target model's eval format, run direct and ambiguous prompt variants, and preserve the raw trace as a CI artifact. Never weaken `forbiddenOutputFields`, `mustNotCall`, confirmation, or authorization assertions to improve a model score.
