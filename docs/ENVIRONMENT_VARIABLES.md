# Environment variables

This is the server configuration contract for the hackathon MVP. Base runtime
variables are always required; provider variables are required only when their
feature is enabled. Missing secrets fail closed. No secret may use a
`NEXT_PUBLIC_` prefix or appear in logs, tool output, browser JSON, URLs, or CI
artifacts. Boolean flags accept only lowercase `true` or `false`; unset feature
flags default to `false`.

## Passport project

| Variable                     | Required                       | Exposure     | Purpose                                                                        |
| ---------------------------- | ------------------------------ | ------------ | ------------------------------------------------------------------------------ |
| `DATABASE_URL`               | Yes at runtime                 | Server only  | Neon pooled application connection                                             |
| `BETTER_AUTH_SECRET`         | Yes                            | Server only  | High-entropy Better Auth signing secret                                        |
| `BETTER_AUTH_URL`            | Yes                            | Server only  | Exact canonical Passport origin                                                |
| `ADAPTIVE_WORLD_DEMO_SECRET` | Yes                            | Server only  | Passport-only HMAC key for short-lived WebMCP projection-preparation tokens    |
| `NEXT_PUBLIC_PASSPORT_URL`   | Yes                            | Browser-safe | Canonical Passport origin                                                      |
| `NEXT_PUBLIC_GYM_URL`        | Yes                            | Browser-safe | Approved Gym handoff origin                                                    |
| `ENABLE_DEMO_RESET`          | Release Preview/demo path only | Server only  | Allows only the exact Elena clinician demo operator to restore canonical state |
| `ENABLE_SAVED_ROUTINES`      | Yes for the judged Pro path    | Server only  | Enables owner-only saved-routine reads and conditional UI                      |
| `SEED_DEMO`                  | No; keep false when deployed   | Server only  | Enables development self-sign-up only; it does not run the seed script         |

Set `ENABLE_SAVED_ROUTINES=true` in every Preview or Production demo expected
to show the paid routine in Passport. Set `ENABLE_DEMO_RESET=true` only in an
isolated, synthetic-only environment containing the published demo accounts.
Only the exact Elena clinician operator may restore fixtures. Keep the flag
false for any environment containing non-demo data.

The Passport and Gym projects both use the environment-variable name
`ADAPTIVE_WORLD_DEMO_SECRET`, but they are separate trust domains and must have
distinct high-entropy values. The Passport value signs only the server-prepared
projection review token that Passport verifies again after approval. It is not
a Gym session key and must not be copied into the Gym project.

## Gym project: base

| Variable                     | Required       | Exposure     | Purpose                                         |
| ---------------------------- | -------------- | ------------ | ----------------------------------------------- |
| `DATABASE_URL`               | Yes at runtime | Server only  | Same environment's pooled Neon connection       |
| `ADAPTIVE_WORLD_DEMO_SECRET` | Yes            | Server only  | Gym-only key for the anonymous HttpOnly session |
| `NEXT_PUBLIC_GYM_URL`        | Yes            | Browser-safe | Canonical Gym origin                            |
| `NEXT_PUBLIC_PASSPORT_URL`   | Yes            | Browser-safe | Canonical Passport origin                       |

Use a Gym-specific `ADAPTIVE_WORLD_DEMO_SECRET`; never reuse the Passport
preparation-token key even though the variable name is the same in each
project-scoped environment.

## Routine Pro and feature gates

| Variable                        | Required                       | Exposure    | Purpose                                                                          |
| ------------------------------- | ------------------------------ | ----------- | -------------------------------------------------------------------------------- |
| `ENABLE_ROUTINE_PRO`            | Optional; default `false`      | Server only | Master kill switch for new premium generation; free tools remain available       |
| `ENABLE_STRIPE_TEST_CHECKOUT`   | Optional; default `false`      | Server only | Enables new Stripe test Checkout setup only when the master flag is also true    |
| `ENABLE_AGENT_MPP_PAYMENT`      | Optional; default `false`      | Server only | Enables new MPP testnet attempts only when the master flag is also true          |
| `ROUTINE_PRO_PRICE_MINOR`       | Optional; exact default `499`  | Server only | Must remain `499` for the judged build                                           |
| `ROUTINE_PRO_CURRENCY`          | Optional; exact default `usd`  | Server only | Must remain lowercase `usd` for the judged build                                 |
| `COMMERCE_CAPABILITY_SECRET`    | When Routine Pro is enabled    | Server only | HMAC secret for stable order capabilities and privacy-preserving rate-limit keys |
| `DEMO_AGENT_DAILY_BUDGET_MINOR` | Optional; exact default `5000` | Server only | Atomic daily test budget in Routine Pro minor units                              |

Price, currency, entitlement, payer/provider, merchant, wallet, chain, and
destination are server authority. They are never accepted from WebMCP input.

Disabling either provider removes only that payer mode. Disabling Routine Pro
prevents new premium generation without disabling public Gym profile/equipment
tools or free Passport context inspection. Verified events and already-prepared
provider state must continue to reconcile while new purchases are disabled.

Recommended release-stage values:

| Stage                         | Passport flags                                            | Gym flags                                                                                  |
| ----------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Development default           | Reset off; saved routines optional                        | Master, Stripe, and MPP off                                                                |
| Preview baseline              | Saved routines on; reset on only for isolated demo data   | Master, Stripe, and MPP off                                                                |
| Preview provider verification | Saved routines on; reset on for the synthetic test branch | Master on; enable the provider under test, or both only for the controlled cross-rail race |
| Production demo               | Saved routines on; reset on only for the public fixture   | Master on after release gates; enable at most one provider at a time                       |

These are deployment-time variables, not instantaneous runtime toggles. Every
change requires a new deployment and a new recorded deployment ID. Do not call
an environment-variable edit a completed kill switch until that deployment is
serving traffic.

## Stripe test mode

| Variable                         | Required when enabled  | Exposure    | Purpose                                             |
| -------------------------------- | ---------------------- | ----------- | --------------------------------------------------- |
| `STRIPE_SECRET_KEY`              | Yes                    | Server only | Stripe test-mode API key                            |
| `STRIPE_WEBHOOK_SECRET`          | Yes                    | Server only | Exact deployed webhook endpoint secret              |
| `STRIPE_ROUTINE_PRO_PRICE_ID`    | Yes                    | Server only | Allowlisted test Price for quantity one             |
| `STRIPE_CHECKOUT_WINDOW_MINUTES` | Optional; default `60` | Server only | Requested provider window; validated range `35–120` |

Provision Stripe separately for Preview and Production demo:

- use a Stripe test-mode secret and confirm created Checkout Sessions report
  `livemode=false`;
- create one one-time Price for exactly USD $4.99 (`499` minor units) and set
  its test Price ID as `STRIPE_ROUTINE_PRO_PRICE_ID`;
- register the exact endpoint
  `https://<gym-origin>/api/stripe/webhook` for
  `checkout.session.completed`,
  `checkout.session.async_payment_succeeded`,
  `checkout.session.async_payment_failed`,
  `checkout.session.expired`,
  `refund.created`, `refund.updated`, and `refund.failed`;
- store that endpoint's signing secret as `STRIPE_WEBHOOK_SECRET`; a local
  Stripe CLI forwarding secret is not the deployed endpoint secret; and
- verify quantity one, `amount_total=499`, `currency=usd`, and
  `livemode=false` before treating a smoke as evidence.

The complete normalized Checkout request, canonical bytes, fingerprint,
idempotency key, requested expiry, first-request time, and
`idempotency_replay_until` are persisted before the first provider call. Before
the cutoff, retries use the exact snapshot and key. At or after the cutoff, an
unattached setup makes **zero** new create calls and enters
`PROVIDER_SETUP_RECONCILIATION_REQUIRED`. This behavior is not configurable to
extend beyond Stripe's documented retention guarantee.

## MPP testnet demo agent

| Variable                 | Required when enabled | Exposure    | Purpose                                              |
| ------------------------ | --------------------- | ----------- | ---------------------------------------------------- |
| `MPP_SECRET_KEY`         | Yes                   | Server only | MPP merchant verification/configuration secret       |
| `MPP_TEMPO_RECIPIENT`    | Yes                   | Server only | Allowlisted testnet recipient                        |
| `MPP_TEMPO_CURRENCY`     | Yes                   | Server only | Configured test asset/currency                       |
| `DEMO_AGENT_PRIVATE_KEY` | Yes                   | Server only | Bounded Adaptive World demo-agent testnet wallet key |

The current MPP adapter is fixed to Tempo testnet chain ID `42431` and a
six-decimal test asset. `MPP_TEMPO_RECIPIENT` and `MPP_TEMPO_CURRENCY` must be
20-byte `0x`-prefixed addresses; `DEMO_AGENT_PRIVATE_KEY` must be a 32-byte
`0x`-prefixed private key. `MPP_SECRET_KEY` and
`COMMERCE_CAPABILITY_SECRET` must each contain at least 32 bytes. Fund only the
demo-agent address with enough of the configured test asset to cover the
4,990,000-atomic-unit payment and the planned retries. Do not enable the adapter
for a token with different decimals or for a mainnet/private key holding assets
of real-world value.

The wallet belongs to the Gym server. It is not a ChatGPT, OpenAI, browser,
user, or model wallet. The order capability binds public order reference,
product, amount, currency, capability version, and the immutable persisted
`capability_expires_at`. Expiry blocks new submissions; it is distinct from a
provider challenge's `requested_expires_at`. Capability, credential, receipt,
wallet key, and raw provider payload never reach the browser or model.

## Migration and seed only

| Variable                           | Purpose                                                                                |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Exact migration/seed target; use a direct connection for one-off tooling when required |
| `CONFIRM_SYNTHETIC_DEMO_SEED=true` | Explicit guard for the idempotent synthetic seed                                       |
| `DEMO_ACCOUNT_PASSWORD`            | Optional override for the two public synthetic accounts                                |

Never run the seed against an environment containing real or non-demo data.

## Environment isolation

- Development uses disposable data and local origins.
- Preview uses an isolated Neon branch, preview-specific Better Auth/provider
  secrets, Stripe test mode, and MPP testnet only.
- Production demo remains synthetic and uses separate high-entropy secrets.
- Do not copy Production `DATABASE_URL`, provider secrets, wallet key, or
  capability secret into Preview.
- Prepared provider snapshots remain immutable after configuration changes.
- Redeploy after changing variables; an existing deployment does not acquire
  new values automatically.
- A Preview deployment retains the values with which it was built. Do not
  promote it to Production when origins, database, or secrets differ; deploy
  the same reviewed Git SHA using the Production environment and repeat the
  external smoke against the new deployment IDs.

Production aliases currently documented for the demo:

| Application | Canonical origin                        |
| ----------- | --------------------------------------- |
| Passport    | `https://passport-eosin.vercel.app`     |
| Gym         | `https://gym-alpha-amber-89.vercel.app` |

Build-only fallbacks used during static compilation are unreachable endpoints
and are not runtime database configuration. A successful build does not prove a
database, provider, webhook, wallet, or browser journey.
