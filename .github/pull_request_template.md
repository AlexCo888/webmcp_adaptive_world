## Outcome

Describe the user-visible result and affected surface: Passport, clinician,
Gym, WebMCP, commerce/provider state, database, or release documentation.

## Deterministic verification

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm evals:validate` (structural fixtures only; no model claim)
- [ ] `pnpm build`
- [ ] `pnpm e2e`
- [ ] Playwright report/trace inspected for any retry or failure

## WebMCP and authorization

- [ ] Tool catalogs and docs match: owner 4, clinician 5, Gym 7 total with route-scoped subsets.
- [ ] Retired tool names are absent from code, schemas, fixtures, docs, prompts, and UI.
- [ ] Every protected invocation rechecks server session, actor, relationship, exact scope, expiry, and revocation.
- [ ] Unauthorized IDs do not reveal resource existence.
- [ ] Route changes unregister prior tools.
- [ ] Reads require no confirmation; consequential actions prepare without writes and require exact first-party approval.
- [ ] Decline causes zero writes; approval is idempotent and executes once.
- [ ] Free profile/equipment and ordinary accessible UI work without Passport, WebMCP, or payment.

## Privacy and safety

- [ ] Data remains synthetic and visibly non-clinical.
- [ ] Gym projection contains only allowlisted minimum context.
- [ ] Payment does not change Passport scopes.
- [ ] No secret, raw code, health payload, capability, credential, receipt, provider snapshot, Session ID, wallet key, or database URL appears in logs or WebMCP output; human Checkout receives only its allowlisted navigation URL.
- [ ] Manufacturer/source text remains marked untrusted.
- [ ] Output and error envelopes are bounded and safe.

## Routine Pro and commerce

- [ ] Price/currency/product/patient/payer/provider/merchant/wallet/destination are server-derived.
- [ ] One payable order is enforced per patient/product across templates, routes, sessions, and rails.
- [ ] UI and WebMCP consume the same entitlement.
- [ ] Stripe snapshot/key/canonical bytes/fingerprint/expiry/replay cutoff persist before the first call.
- [ ] Retry before cutoff uses the exact Stripe request; retry at/after cutoff makes zero create calls and reconciles.
- [ ] MPP capability version/digest/immutable expiry persist before challenge and regenerate exactly after process loss.
- [ ] Agent budget reserve/submit/settle/release transitions are atomic and idempotent.
- [ ] Payment endpoints apply durable HMAC-keyed session/order/IP/agent rate limits without persisting raw identifiers.
- [ ] Ambiguous submitted spend remains reserved.
- [ ] Provider replay, duplicate fulfillment, and cross-rail race tests pass.
- [ ] Reset preserves provider/replay/budget evidence and cannot affect non-demo data.
- [ ] Payment feature flags can be disabled without affecting free tools.

## Deployment and evidence

- [ ] Migration is additive/backward compatible and rollback implications are documented.
- [ ] Environment-variable changes are documented; no secret uses `NEXT_PUBLIC_`.
- [ ] Local/remote image provenance and reuse rights are confirmed, or the assets were replaced.
- [ ] Passport project affected
- [ ] Gym project affected
- [ ] No deployment impact
- [ ] Stripe test/webhook smoke recorded against deployed SHA, or explicitly not claimed.
- [ ] MPP testnet smoke recorded against deployed SHA, or explicitly not claimed.
- [ ] Native Chrome and ChatGPT in-app browser evidence recorded, or explicitly not claimed.
- [ ] Model-trial metrics include numerators/denominators and zero prohibited disclosures, or remain marked not run.
- [ ] Final deployments, results, and video use the same Git SHA.
