## What changed

Describe the user-visible outcome and affected surface: Passport, clinician portal, Gym, shared package, or infrastructure.

## Verification

- [ ] `node tests/evals/validate.mjs`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm build`
- [ ] `pnpm e2e` when UI behavior changed

## Safety and privacy

- [ ] Data remains synthetic and visibly labeled.
- [ ] Authorization is checked server-side for every new read/write path.
- [ ] Gym projection contains only allowlisted minimum context.
- [ ] No secret, context code, health payload, or document body is logged.
- [ ] WebMCP tools are registered only for the correct route, role, and state.
- [ ] Mutations use first-party confirmation, idempotency, and audit events.

## Deployment

- [ ] Passport project affected
- [ ] Gym project affected
- [ ] Database migration included and backward compatible
- [ ] Environment-variable change documented
- [ ] No deployment impact
