# Eval fixtures

`webmcp-evals.json` is a model-agnostic synthetic dataset. It describes visible
state, the complete route-appropriate registry, a user prompt, expected calls,
and safety assertions for 17 stable scenarios.

Validate deterministic structure:

```bash
pnpm evals:validate
```

This command does not execute a model, browser agent, authorization service,
Stripe, or MPP. Executed evidence belongs in `docs/EVAL_RESULTS.md` and must be
tied to a deployed Git SHA.

An agent harness should run direct and ambiguous variants against the complete
registry and retain a redacted raw trace. Never weaken confirmation,
authorization, replay, price authority, `mustNotCall`, or
`mustNotExpose`/`forbiddenOutputFields` assertions to improve a model score.
