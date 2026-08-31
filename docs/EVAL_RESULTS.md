# Evaluation results

This file defines the evidence contract for the final judge release. A fixture,
plan, mocked provider, or deterministic WebMCP shim is not counted as a native or
deployed execution.

## Release identity

- Immutable tag: `judge-release-2026-08-30`
- Canonical Git SHA: the commit targeted by that immutable tag
- Runtime evidence: redacted artifacts attached to the GitHub Release with the
  same tag
- Required deployment identity: both Passport and Gym must report that exact tag
  target in Vercel deployment metadata

The SHA is resolved from the immutable tag instead of copied into this file. A
commit cannot truthfully embed its own Git SHA because changing the file changes
the commit. Do not move or recreate the release tag after publication.

## Final judge gates

Last prepared: 2026-08-30 UTC

| Layer                                      | Required for judged release | Status                      | Required evidence                                                                                                         |
| ------------------------------------------ | --------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Fixture, metadata, and asset validation    | Yes                         | Passed locally; CI pending  | 17 fixtures structurally valid; release metadata and all image assets passed validation                                   |
| Formatting, lint, typecheck, tests, builds | Yes                         | Passed locally; CI pending  | Formatting, lint, all TypeScript projects and package tests passed; both Next.js production builds passed unrestricted    |
| Deterministic browser/WebMCP integration   | Yes                         | Passed locally; CI pending  | 16/16 default journeys passed in CI mode on Chromium 151.0.7922.34; six credentialed mutation journeys skipped by design  |
| Matching immutable Vercel deployments      | Yes                         | Pending release candidate   | Passport and Gym immutable URLs plus deployment metadata resolving to the release tag target                              |
| Dynamic alternate-goal canary              | Yes                         | Not run on release artifact | A non-video goal changes the reviewed request and Gym’s requested-goal display; existing Passport goals remain separate   |
| Authenticated human UI journey             | Yes                         | Not run on release artifact | Consent, one-use handoff, free discovery, cancel-without-effect, paid routine, and saved Passport record                  |
| ChatGPT Desktop Site tools journey         | Yes                         | Not run on release artifact | Application/model version, exact two prompts, origin-scoped tool calls, confirmations, and visible completion             |
| One-use redemption and replay rejection    | Yes                         | Not run on release artifact | First redemption succeeds and reuse of the same exchange code is rejected                                                 |
| First-party payment cancellation           | Yes                         | Not run on release artifact | Cancellation creates no completed order, provider submission, budget reservation, entitlement, or routine                 |
| MPP bounded-wallet testnet 402 flow        | Yes                         | Not run on release artifact | Redacted challenge/verification outcome, durable payment transition, entitlement, and routine fulfillment                 |
| Routine persisted back to Passport         | Yes                         | Not run on release artifact | Same owner-authorized routine shown in Gym and Passport with goal, template/catalog versions, provenance, and safety data |
| Stripe test Checkout and webhook           | No                          | Outside judged scope        | Do not enable or claim in the final judged journey                                                                        |
| Repeated probabilistic model scoring       | No                          | Outside judged scope        | No success percentage is claimed                                                                                          |
| Clinician, revocation, or other recipients | No                          | Outside judged scope        | Supporting functionality is not part of the frozen release story                                                          |

Every required row must have observed evidence in the tagged GitHub Release
before the submission is described as judge-ready. A Production recording can
serve as the ChatGPT Desktop and MPP canary only when the immutable Preview
artifact already passed the deterministic, authenticated, dynamic, replay, and
cancellation gates.

## Historical baseline only

GitHub Actions CI run #19 previously established a non-release baseline of 17/17
valid fixtures, 131/131 unit/static tests, successful Passport and Gym builds,
and 15/15 default Playwright journeys. It did not execute the five authenticated
mutation journeys, native Site tools, or a real MPP testnet payment. It is not
evidence for the final tag.

## Tagged release evidence record

Attach one redacted record with these fields to the GitHub Release:

| Field                     | Recorded value                                               |
| ------------------------- | ------------------------------------------------------------ |
| Release tag               | `judge-release-2026-08-30`                                   |
| Git SHA                   | `<tag target: 40-character SHA>`                             |
| GitHub Actions            | `<Quality gates URL and Browser smoke URL>`                  |
| Passport deployment       | `<immutable deployment URL and deployment ID>`               |
| Gym deployment            | `<immutable deployment URL and deployment ID>`               |
| Date/time UTC             | `<ISO 8601>`                                                 |
| Browser / version         | `<name and exact version>`                                   |
| Site tools implementation | `<native implementation/version or deterministic shim>`      |
| Model / environment       | `<model and ChatGPT Desktop environment, or N/A>`            |
| Prompt variant            | `<exact text or stable fixture ID>`                          |
| Trials                    | `<N>`                                                        |
| Valid tool selection      | `<passed>/<N>`                                               |
| Valid arguments           | `<passed>/<N>`                                               |
| Correct ordered chain     | `<passed>/<N>`                                               |
| Visible UI completion     | `<passed>/<N>`                                               |
| Alternate-goal canary     | `<passed/failed plus redacted artifact>`                     |
| One-use replay            | `<first redemption and rejected replay>`                     |
| Cancellation side effects | `<none, or exact discrepancy>`                               |
| MPP testnet outcome       | `<passed/failed plus redacted provider and budget evidence>` |
| Passport persistence      | `<passed/failed plus redacted visible record>`               |
| Prohibited disclosures    | `<count>`                                                    |
| Video                     | `<duration and final artifact location>`                     |
| Notes / artifacts         | `<redacted evidence locations>`                              |

## Publication rules

- Publish a percentage only with its numerator and denominator.
- Never combine deterministic assertions with probabilistic model scores.
- Never label mocked provider Playwright coverage as a real MPP smoke.
- Never label the model-context shim as native ChatGPT Desktop Site tools.
- Do not paste context codes, capabilities, credentials, receipts, signatures,
  private keys, database URLs, cookies, authorization headers, health payloads,
  or wallet addresses.
- The final video, release evidence, and both deployed applications must resolve
  to the immutable release tag target.
