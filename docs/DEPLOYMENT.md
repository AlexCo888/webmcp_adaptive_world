# Deployment and release checklist

Vercel Git integration deploys Passport and Gym as distinct projects from the
same repository commit. GitHub CI covers deterministic repository behavior;
deployed browser, model, Stripe, webhook, and MPP evidence is recorded
separately in [`EVAL_RESULTS.md`](./EVAL_RESULTS.md).

## Vercel projects

| Setting              | Passport        | Gym        |
| -------------------- | --------------- | ---------- |
| Root Directory       | `apps/passport` | `apps/gym` |
| Framework            | Next.js         | Next.js    |
| Production branch    | `main`          | `main`     |
| Shared-source access | Enabled         | Enabled    |

Configure each project's variables independently. Never let Preview inherit a
Production database, Better Auth secret, Stripe secret/webhook secret, MPP
secret, demo-agent key, or capability secret. Set a distinct high-entropy
`ADAPTIVE_WORLD_DEMO_SECRET` in each project: Passport uses its value for
short-lived WebMCP preparation tokens, while Gym uses a different value for its
anonymous HttpOnly session. Do not share either value across projects or stages.

## Environment stages

- **Development:** local origins and disposable synthetic data; providers off by default.
- **Preview:** isolated Neon branch, random preview secrets, Stripe test mode, MPP testnet, and Preview callback/origin values.
- **Production demo:** synthetic data only, canonical aliases, high-entropy environment-specific secrets, sandbox/test providers only.

Environment variables and feature flags are captured by a deployment. Changing
a Vercel variable does not update an existing immutable deployment; redeploy the
affected application and record the new deployment ID before treating a flag as
enabled or disabled. Use the stage-specific flag matrix in
[`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md).

The required deployed authorization boundary is fresh application-level
authorization. Do not activate or claim runtime RLS unless the all-or-nothing
non-owner-role gate in `ARCHITECTURE.md` has been completed and tested.

## Deployment order

1. Freeze the candidate Git SHA. Confirm the root MIT license, third-party
   notices, and truthful evidence ledger are present.
2. Create an isolated database backup/branch. Export the exact migration target
   explicitly—the DB package does not load either app's `.env.local`—and apply
   the additive migration:

   ```bash
   export ADAPTIVE_WORLD_DB_TOOL_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'
   DATABASE_URL="$ADAPTIVE_WORLD_DB_TOOL_URL" pnpm --filter @adaptive-world/db migrate
   ```

3. If and only if the isolated branch does not already contain the canonical
   synthetic fixtures, run the guarded seed against that same verified target,
   then clear the shell variable:

   ```bash
   DATABASE_URL="$ADAPTIVE_WORLD_DB_TOOL_URL" CONFIRM_SYNTHETIC_DEMO_SEED=true pnpm --filter @adaptive-world/db seed:demo
   unset ADAPTIVE_WORLD_DB_TOOL_URL
   ```

4. Configure Preview Passport with its own `ADAPTIVE_WORLD_DEMO_SECRET`,
   `ENABLE_SAVED_ROUTINES=true` and, only for the isolated synthetic reset test,
   `ENABLE_DEMO_RESET=true`. Keep `SEED_DEMO=false`. Configure Gym with a
   different `ADAPTIVE_WORLD_DEMO_SECRET` and Routine Pro, Stripe, and MPP flags
   all false. Deploy both applications from the frozen SHA and record both IDs.
5. Verify public Gym profile/equipment HTML, APIs, and WebMCP remain free. Verify
   owner/clinician authorization, context expiry/replay, and synthetic reset.
6. Set `ENABLE_ROUTINE_PRO=true` while both provider flags remain false,
   redeploy Gym, and record its new deployment ID. Verify that free behavior is
   unchanged and that a non-entitled owner cannot start a payer.
7. Provision Stripe for the Preview origin, set only
   `ENABLE_STRIPE_TEST_CHECKOUT=true`, redeploy Gym, and execute the complete
   setup/retry/webhook smoke. After verified fulfillment, test the entitled
   no-second-payment path and Passport saving before resetting the fixture.
8. Reconcile/reset safely. Disable Stripe, configure the MPP testnet payer, set
   only `ENABLE_AGENT_MPP_PAYMENT=true`, redeploy Gym, and execute the bounded
   wallet, capability, budget, and timeout smoke.
9. Reconcile/reset to a non-entitled free state. In an isolated Preview only,
   enable both provider flags in a new deployment long enough to run the cross-
   rail serialization test. Reconcile every order and reservation, then return
   Preview to one provider or both providers off in another recorded deployment.
10. Record deterministic, browser, provider, model, and video evidence against
    the frozen Git SHA and the exact deployment IDs that produced each result.
11. Configure the separate Production environment and deploy the same reviewed
    SHA to both projects with at most one provider enabled. These are new
    immutable artifacts; record their IDs and repeat the applicable clean-
    browser and provider smoke before using the aliases.

The seed does not create an entitlement. Do not bootstrap one with an
undocumented manual database insert. The first release entitlement must come
from verified sandbox/testnet provider fulfillment; only then can the existing-
entitlement path be tested without another payment.

## Database/provider invariants before enablement

- one payable order per `patient_id + product_key` across all rails/templates;
- immutable bounded natural-language goal and initial staff template on every new payable order;
- one active entitlement per patient/product;
- one nonterminal provider setup per order;
- unique provider resource/event/receipt evidence;
- immutable Stripe request snapshot, fingerprint, requested expiry, and key;
- persisted `first_request_started_at` and `idempotency_replay_until`;
- persisted MPP `capability_expires_at`, version, and digest before challenge;
- unique order budget reservation and locked daily budget bucket;
- durable keyed-HMAC rate-limit counters for session, order, IP, and agent-subject dimensions;
- saved routines owner-authorized and plan hash stable.

## Preview deterministic gate

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm e2e
```

By default, `pnpm e2e` starts local applications. To run its public smoke against
two deployed candidates, provide both URLs so Playwright does not silently
start local servers:

```bash
PASSPORT_BASE_URL='https://<passport-preview>' GYM_BASE_URL='https://<gym-preview>' pnpm e2e
```

Required observations:

- fixture command says it structurally validated 17 scenarios and does not claim a model run;
- Passport owner has four tools and clinician exactly five;
- no retired tool name appears in source, fixtures, schema, docs, or UI;
- public Gym registers profile/search/detail tools without Passport/payment;
- route transition unregisters prior tools;
- read executes directly; mutation prepares and pauses for first-party confirmation;
- decline causes zero writes; approval causes exactly one idempotent action;
- agent search updates the existing catalog and routine fills the existing canvas;
- result serialization remains within 1,500 characters;
- authorization, expiry, replay, BOLA, reset, order, budget, and provider-state tests pass;
- payment endpoint tests prove all four rate-limit dimensions are enforced without storing raw identifiers.

The deterministic shim is not native Chrome WebMCP or a model eval.

## Authenticated deployed canary

Run the authenticated suite only against a migrated, seeded synthetic stage.
The agent-payment journey has its own opt-in because it contacts the configured
sandbox/testnet provider and resets the synthetic fixture before and after the
test:

```bash
RUN_AUTHENTICATED_E2E=true \
ALLOW_SYNTHETIC_STATE_MUTATION=true \
ALLOW_SYNTHETIC_DEMO_RESET_E2E=true \
ALLOW_SYNTHETIC_AGENT_PAYMENT_E2E=true \
PASSPORT_BASE_URL='https://<passport-deployment>' \
GYM_BASE_URL='https://<gym-deployment>' \
E2E_DEMO_PASSWORD='<approved synthetic credential>' \
pnpm exec playwright test tests/e2e/passport-authenticated.spec.ts
```

The payment canary must observe `agent_wallet` in the live offer, approve the
first-party **$4.99 test USD** confirmation, receive one saved routine, verify
the exact natural-language goal in both the active Gym session and Passport,
then prove the clinician-authorized reset succeeds. Never set the payment opt-in
for a real-funds wallet or a non-synthetic account.

## Stripe Preview setup and smoke

Before enabling the flag:

- switch the Stripe account to test mode and use a test-mode secret;
- create one one-time test Price for exactly USD $4.99 (`499` minor units);
- register `https://<gym-preview>/api/stripe/webhook` for
  `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`,
  `checkout.session.expired`,
  `refund.created`, `refund.updated`, and `refund.failed`;
- store that deployed endpoint's signing secret, not a local Stripe CLI
  forwarding secret; and
- redeploy Gym after setting the Price ID, secrets, and flag.

- [ ] Checkout uses the allowlisted test Price and quantity one.
- [ ] The created Session reports `livemode=false`, `amount_total=499`, and `currency=usd`.
- [ ] Snapshot/key/canonical bytes/fingerprint/replay cutoff exist before the first API call.
- [ ] Simulated lost response retries the exact same key and parameters before cutoff.
- [ ] Simulated attachment failure recovers the same Checkout Session.
- [ ] Concurrent setup requests recover one Session or return setup pending.
- [ ] Retry at/after `idempotency_replay_until` sends zero create requests and enters reconciliation.
- [ ] Redirect/cancel alone does not unlock or release the order.
- [ ] Invalid webhook signature and amount/currency mismatch fail closed.
- [ ] Duplicate webhook is harmless; verified webhook activates one entitlement and resumes generation.
- [ ] No snapshot, signature, Session ID, or health/internal patient data appears in Vercel logs.

## MPP Preview setup and smoke

Before enabling the flag:

- use Tempo testnet chain ID `42431` only;
- configure `MPP_TEMPO_RECIPIENT` and `MPP_TEMPO_CURRENCY` as 20-byte
  `0x`-prefixed addresses;
- configure a 32-byte `0x`-prefixed demo-agent private key and independent
  MPP/capability secrets of at least 32 bytes each;
- verify that the configured test asset has six decimals and fund the demo
  wallet with test assets sufficient for a 4,990,000-atomic-unit payment plus
  planned retries; and
- redeploy Gym after setting the values and flag. Never use a mainnet key or an
  asset with real-world value.

- [ ] Bounded demo wallet receives a real testnet 402 challenge.
- [ ] `capability_expires_at` is persisted and HMAC-bound before challenge.
- [ ] Simulated process loss regenerates the byte-identical capability for the same order.
- [ ] Budget is atomically reserved before credential submission and increments once.
- [ ] Exact credential succeeds once; replay fails.
- [ ] Ambiguous timeout reuses the order/capability/reservation and cannot switch rails.
- [ ] Expired capability blocks new submission without clearing submitted/settled budget.
- [ ] Two concurrent attempts cannot exceed the daily cap.
- [ ] Capability, key, credential, receipt, wallet/destination, and provider payload are absent from logs/browser/tool output.

## Manual release gate

- [ ] Both immutable Preview deployments correspond to the same Git SHA.
- [ ] Both Production deployments correspond to that reviewed Git SHA and their aliases work in clean incognito without Vercel protection or `_vercel_share`.
- [ ] Owner and clinician demo credentials work.
- [ ] Elena, the clinician demo operator, can use **Tools → Restore synthetic demo**; the owner cannot, and unsafe unresolved provider state conflicts.
- [ ] After reset, sign-out and Mateo owner sign-in leave the primary Passport → Gym path ready.
- [ ] Native Chrome WebMCP shows only route/role/state tools and completes the primary path.
- [ ] ChatGPT's in-app browser completes the critical path or the exact limitation is recorded truthfully.
- [ ] Stripe test Checkout/webhook and MPP testnet smokes are recorded.
- [ ] Repeated model trials and adversarial trials are recorded with denominators and zero prohibited disclosures.
- [ ] Final video is public, audible, below three minutes, and uses the same deployed SHA.
- [ ] Public repository contains production URLs, published synthetic-demo account credentials only, license, notices, and truthful evidence; it contains no environment or provider credential.
- [ ] Local and remote image provenance/reuse rights are confirmed; unresolved assets are replaced before publication.

Do not check a box based on a mock, redirect, fixture, plan, or code inspection.

## Production deployment

Preview and Production intentionally use different origins, databases, and
secrets. A Preview artifact retains the values with which it was built, so the
normal release path is to deploy the same reviewed Git SHA using each project's
Production environment—not to promote a Preview artifact and assume that it
acquires Production values.

Record both new Production deployment IDs and the Git SHA, then repeat the
applicable external smoke. Promotion is valid only if the candidate artifact
was built with the final Production origins and every other required value is
identical; document that exceptional equivalence before using `vercel promote`.
Use expand/contract migrations so the two projects remain compatible during
the non-atomic two-project deployment window.

## Rollback and kill switches

- Set `ENABLE_AGENT_MPP_PAYMENT=false` and redeploy Gym to stop new agent
  payments only.
- Set `ENABLE_STRIPE_TEST_CHECKOUT=false` and redeploy Gym to stop new human
  Checkouts only.
- Set `ENABLE_ROUTINE_PRO=false` and redeploy Gym to stop new premium generation
  while every free public Gym tool remains available.
- Continue reconciling verified provider events and existing prepared/attached
  setups even when new purchases are disabled. Keep the provider secrets needed
  for that reconciliation until every durable state is terminal.
- Never roll back a migration while orders, setup snapshots, entitlements,
  routines, events, or budget rows depend on it.
- Never erase or release ambiguous provider/submitted state to simplify rollback.
- Roll both applications to the last schema-compatible deployment and deploy a
  forward database repair when necessary.

Do not describe a variable edit as an active kill switch until the replacement
deployment serves traffic. Document the affected SHAs, old and new deployment
IDs, provider flags, synthetic public references, and redacted audit events.
Never paste environment values into an issue, PR, video, or incident record.
