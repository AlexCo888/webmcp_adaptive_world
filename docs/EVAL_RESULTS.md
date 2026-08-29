# Evaluation results

This file is the evidence ledger for the hackathon release. Results are tied to
an exact deployed Git SHA. A fixture or plan is not counted as an executed test.

## Current evidence snapshot

Last updated: 2026-08-29 UTC

| Layer                                   | Git SHA / deployment            | Status                            | Evidence                                                                                                                                                            |
| --------------------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fixture structural validation           | Local final pre-PR working tree | Passed                            | `pnpm evals:validate`: 17/17 fixtures; no model executed                                                                                                            |
| Unit and static database suite          | Local final pre-PR working tree | Passed                            | `pnpm test`: 127/127 tests across contracts, DB, data, security, WebMCP, Passport, and Gym                                                                          |
| Formatting, lint, and typecheck         | Local final pre-PR working tree | Passed                            | `pnpm check`: Prettier, repository ESLint, and all TypeScript projects                                                                                              |
| Production builds                       | Local final pre-PR working tree | Passed                            | `pnpm check`: optimized Passport and Gym Next.js builds                                                                                                             |
| Playwright smoke and model-context shim | Local final pre-PR working tree | Browser execution blocked locally | 20 tests discovered; one API-only journey passed; 14 browser journeys need unavailable Chromium; 5 authenticated journeys require explicit seeded-environment flags |
| Native Chrome WebMCP journey            | No release deployment recorded  | Not run                           | Record browser/version, registry, calls, and visible effects                                                                                                        |
| ChatGPT in-app browser journey          | No release deployment recorded  | Not run                           | Record application/model environment and exact prompt                                                                                                               |
| Stripe test Checkout + deployed webhook | No release deployment recorded  | Not run                           | Record redacted order/setup/event references and outcome                                                                                                            |
| MPP bounded-wallet testnet 402 flow     | No release deployment recorded  | Not run                           | Record redacted challenge/receipt outcome and budget transition                                                                                                     |
| Repeated primary model trials           | No release deployment recorded  | Not run                           | No accuracy percentage is claimed                                                                                                                                   |
| Adversarial model trials                | No release deployment recorded  | Not run                           | No prohibited-disclosure rate is claimed                                                                                                                            |

The exact pull-request head SHA and a rerun summary are recorded in the PR conversation after the
branch is pushed. The local Playwright limitation is environmental, not counted as a passing
browser run; CI must install the pinned Chromium build for the 14 default browser journeys. The
five authenticated mutation journeys must run only against an explicitly opted-in, migrated,
seeded synthetic environment.

These not-run entries are release blockers, not failures hidden by a passing
fixture validator. Update this file only from observed evidence.

## Result record template

Copy one row per stable environment/run group:

| Field                  | Recorded value                                          |
| ---------------------- | ------------------------------------------------------- |
| Git SHA                | `<40-character SHA>`                                    |
| Passport deployment    | `<immutable deployment URL>`                            |
| Gym deployment         | `<immutable deployment URL>`                            |
| Date/time UTC          | `<ISO 8601>`                                            |
| Browser / version      | `<name and exact version>`                              |
| WebMCP implementation  | `<native implementation/version or deterministic shim>` |
| Model / environment    | `<model and ChatGPT/API environment, or N/A>`           |
| Prompt variant         | `<exact text or stable fixture ID>`                     |
| Trials                 | `<N>`                                                   |
| Valid tool selection   | `<passed>/<N>`                                          |
| Valid arguments        | `<passed>/<N>`                                          |
| Correct ordered chain  | `<passed>/<N>`                                          |
| Visible UI completion  | `<passed>/<N>`                                          |
| Output budget          | `<passed>/<N>`                                          |
| Prohibited disclosures | `<count>`                                               |
| Notes / artifact       | `<redacted evidence location>`                          |

## Publication rules

- Publish a percentage only with its numerator and denominator.
- Never combine deterministic assertions with probabilistic model scores.
- Never label mocked provider Playwright coverage as a real Stripe or MPP smoke.
- Never label the model-context shim as native Chrome WebMCP.
- Do not paste context codes, capabilities, credentials, receipts, signatures,
  private keys, database URLs, cookies, authorization headers, or health payloads.
- The final video, results, and both deployed applications must reference the same Git SHA.
