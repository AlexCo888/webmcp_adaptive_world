# Threat model: minimum context, WebMCP, and sandbox commerce

Last reviewed: 2026-08-29. Scope: public hackathon MVP using synthetic health
data, Stripe test mode, and MPP testnet.

## Safety position

Adaptive World demonstrates user-controlled context sharing and a bounded
sandbox entitlement flow. It does not diagnose, treat, monitor emergencies,
credential clinicians, provide medical clearance, process real payments,
transmit money, or custody assets. Production use with real health or financial
data requires a separate legal, security, privacy, clinical-safety, payments,
and compliance program.

## Protected assets

- Passport identity, synthetic health sources, observations, and consent choices
- clinician relationships, scopes, expiry, and revocation state
- one-use context codes and minimum Gym projections
- authentication sessions, database/provider keys, webhook secrets, wallet key, and capability secret
- order uniqueness, entitlement integrity, immutable provider setup snapshots, provider events, and receipt digests
- agent daily budget and submitted/settled reservations
- audit integrity and the distinction between synthetic, test, and real data
- user agency for every share, revoke, payment, routine save, guidance, and feedback write

## Threats and required controls

| Threat                          | Example                                                    | Required controls                                                                                                                             |
| ------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Broken object authorization     | Clinician guesses another patient/routine ID               | Fresh session/relationship/scope query; owner-only saved-routine read; uniform `FORBIDDEN`/`NOT_FOUND`; negative tests                        |
| Stale authorization             | Already-open clinician page retains revoked access         | No bootstrap state as WebMCP authority; server recheck on every invocation; no-store response                                                 |
| Over-sharing                    | Gym or payment metadata receives medication/lab/patient ID | Allowlist projection; denylist schema; provider metadata limited to opaque public reference/product; output/log tests                         |
| Context-token replay            | One-use code is redeemed twice                             | 256-bit token; digest at rest; 1–20 minute expiry; fragment removal; atomic consumption                                                       |
| Prompt injection                | Source/manufacturer text asks agent to reveal data         | `untrustedContentHint`; source text never becomes policy; bounded output; no silent write chain                                               |
| Confused deputy                 | Wrong route/role invokes a mutation                        | Route/state registration plus server authorization; closed input; first-party confirmation                                                    |
| Confirmation race               | Quote changes after person approves                        | Read-only preparation; quote digest is correlation only; server recomputes and requires fresh approval                                        |
| Client-supplied authority       | Agent changes price, payer, merchant, wallet, or patient   | All authority server-derived; impossible schema fields; strict unknown-property rejection                                                     |
| Duplicate charge                | Stripe and MPP race for one entitlement                    | Stable patient-row lock; one payable patient/product order; one nonterminal provider setup; duplicate-payment reconciliation                  |
| Stripe stale idempotency replay | Retried key was pruned and creates a second Session        | Persist first-request time and `idempotency_replay_until`; before cutoff exact replay; at/after cutoff zero create calls and reconciliation   |
| Stripe response/attachment loss | Session exists but local row is unattached                 | Snapshot and idempotency key committed first; exact same retry within safe window; conditional attachment; fail closed if ambiguous           |
| Redirect spoof                  | Success URL unlocks Pro without webhook                    | Verified signed webhook and exact amount/currency/provider state only                                                                         |
| MPP capability loss or mutation | Crash cannot reconstruct exact retry capability            | Persist version, digest, and immutable `capability_expires_at`; HMAC binds public ref/product/amount/currency/version/expiry                  |
| Credential/receipt replay       | Same testnet evidence fulfills twice                       | Unique provider reference/event/receipt digest; conditional state transition; independent capability and receipt checks                       |
| Agent overspend                 | Concurrent sessions each pass a stale budget read          | Locked daily bucket; unique per-order reservation; atomic reserve before provider call; idempotent settle/release                             |
| Ambiguous spend released early  | Timeout frees budget, then late success exceeds cap        | Submitted/reconciliation state remains reserved until definitive finality; reset/local expiry cannot release it                               |
| Unsafe reset                    | Judge reset erases payment/replay evidence                 | Synthetic identity allowlist; one transaction; preserve successful refs, snapshots, settled/submitted budget; conflict on unresolved state    |
| Secret disclosure               | Capability/provider snapshot appears in tool trace         | Server-only modules; allowlisted envelopes; structured redaction; negative log/output tests                                                   |
| CSRF/origin abuse               | External page submits a confirmed write                    | Same-site sessions; exact trusted origins; CSRF/origin checks; POST-only mutation                                                             |
| Denial of service               | Agent loops provider or source calls                       | Durable 10-minute database counters keyed by HMAC-hashed session, order, IP, and agent subject; timeouts, result caps, provider kill switches |
| Supply-chain compromise         | SDK injects or exfiltrates data                            | Frozen lockfile; pinned reviewed provider versions; minimal server-only surface; notices and dependency review                                |

## WebMCP controls

1. Tool calls express intent, never authority.
2. Registries are route-, role-, and state-scoped and unregister on change.
3. Public Gym reads require neither Passport nor payment.
4. Protected reads resolve current server authority on every invocation.
5. Consequential actions use application-owned confirmation; preparation writes nothing.
6. Failed context/offer/provider calls stop the dependent chain.
7. Output is structured, safe, and at most 1,500 characters.
8. The deterministic model-context shim proves integration mechanics only.

## Minimum Gym projection

Allowlist:

- anonymous subject reference
- goals and preferences
- functional capabilities
- movement constraints and avoidances
- synthetic stop signals
- purpose, provenance class, issue time, expiry, and revocation reference

Explicit denylist:

- name, age/date of birth, contact details, emergency contact
- diagnoses, medications, allergies, raw labs, PDFs, clinician notes/identity
- Passport, patient, document, order, provider-setup, or payment identifiers

Construction starts from an empty object and copies only allowlisted fields.

## Commerce redaction

Never expose raw PAN/CVC, delegated card credential, wallet key, capability,
payment credential, receipt, Stripe signature, provider request snapshot,
cookie, authorization header, or database URL in a WebMCP result or log. A
first-party human Checkout response may carry only an allowlisted
`https://checkout.stripe.com` navigation URL; never echo or log its embedded
Session token.

Stripe metadata contains only an opaque order public reference, product key, and
sandbox marker. Payment does not change context scopes. The ordinary UI never
uses crypto terminology or shows a wallet/balance dashboard.

## Reset policy

Reset may restore canonical grants, delete transient context/sessions/feedback,
revoke the synthetic entitlement, archive synthetic saved routines, and void
orders proven unpaid. It may release only a budget reservation known not to have
submitted payment.

Reset must preserve provider events, successful references, receipt digests,
immutable/ambiguous setup snapshots, settled budget, submitted reservations,
and testnet transaction history. It returns `CONFLICT` when safe reconciliation
is not possible.

## Release blockers

- real patient, card, or payment data;
- client-supplied identity, role, price, payer, provider, wallet, or entitlement;
- any Gym output containing a denylisted field;
- reusable/plaintext/logged/query-string context code;
- write or payment without exact first-party confirmation;
- more than one payable order/provider window for one patient/product;
- Stripe create retry after the persisted replay-safe cutoff;
- MPP capability without immutable persisted expiry;
- released ambiguous submitted spend;
- reset that can affect non-demo data or erase reconciliation evidence;
- missing synthetic/test/non-clinical labels;
- failing authorization, replay, minimization, provider-state, or budget test;
- public claim based only on a fixture, mock, redirect, or unrecorded smoke.

## Residual risk

Models are probabilistic, WebMCP remains experimental, provider networks can be
ambiguous, and synthetic safeguards do not establish production compliance.
The MVP therefore stays narrow: synthetic-only data, free public discovery,
minimum context, deterministic server authorization, one low-cost sandbox
entitlement, bounded tools, visible confirmation, immutable provider state,
fail-closed reconciliation, and an ordinary accessible UI.
