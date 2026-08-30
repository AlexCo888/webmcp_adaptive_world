# WebMCP tool contract

WebMCP enhances the visible first-party UI. It does not replace semantic HTML,
server APIs, authorization, consent, or confirmation. Registration is a
discoverability surface and never grants permission.

## Registration rules

- Register tools only after route, authentication, role, and relevant state resolve.
- Unregister the previous route's tools on navigation or state loss.
- Keep Passport and clinician tools same-origin; never add broad `exposedTo` access.
- Keep all public Gym facts available through the ordinary accessible UI.
- Never register a paid mutation on a route where its first-party confirmation and result canvas are absent.
- A model-context shim may test mechanics; it must not be described as a model-selection evaluation.

## Passport owner: four tools

| Tool                      | Type            | Available when                    | Result or effect                               |
| ------------------------- | --------------- | --------------------------------- | ---------------------------------------------- |
| `get_my_passport_summary` | Read            | Owner is viewing the own Passport | Bounded synthetic summary; no source bodies    |
| `list_my_shares`          | Read            | Owner views sharing               | Current owner grants and scopes                |
| `create_context_grant`    | Confirmed write | Owner reviews Gym projection      | One-use, 1–15 minute minimum-context handoff   |
| `revoke_access_grant`     | Confirmed write | Owner selects an active grant     | Idempotent revocation and redacted audit event |

## Clinician: exactly five tools

| Tool                    | Type                       | Available when                          | Result or effect                                   |
| ----------------------- | -------------------------- | --------------------------------------- | -------------------------------------------------- |
| `search_my_patients`    | Read                       | Authenticated clinician                 | Searches only current active relationships         |
| `get_patient_overview`  | Read                       | Authorized patient selected             | Minimal overview and scoped section handles        |
| `get_patient_section`   | Read                       | Exact section is granted                | One bounded section, not a full Passport           |
| `open_patient_source`   | Read, untrusted            | Exact source and patient are authorized | One bounded synthetic source                       |
| `add_clinical_guidance` | Confirmed write, untrusted | Guidance scope is current               | Idempotent guidance write and redacted audit event |

There is no global patient search and no simulated timeline/change tool.

Clinician reads call `POST /api/webmcp`; confirmed guidance calls the protected
`POST /api/guidance` route. Both paths resolve the current Better Auth session
and application actor, re-query the active relationship, and recheck exact
scope, expiry, and revocation. Unauthorized IDs use an indistinguishable
`FORBIDDEN` or `NOT_FOUND` response.

## Adaptive Gym: seven tools total

| Tool                          | Type                       | Payment                                        | Route/state behavior                                              |
| ----------------------------- | -------------------------- | ---------------------------------------------- | ----------------------------------------------------------------- |
| `get_gym_profile`             | Public read                | Never                                          | Public home, catalog, and routine surfaces                        |
| `search_equipment`            | Public read, untrusted     | Never                                          | Updates the existing catalog controls/cards                       |
| `get_equipment`               | Public read, untrusted     | Never                                          | Opens an existing `/equipment/[slug]` record                      |
| `get_active_context`          | Read                       | Never                                          | Only after a valid one-use Passport handoff                       |
| `get_routine_pro_offer`       | Read                       | Never                                          | Active context; returns bounded server-authoritative display data |
| `create_personalized_routine` | Confirmed mutation         | Existing entitlement or approved sandbox payer | Existing Session Planner route/canvas only                        |
| `record_session_feedback`     | Confirmed write, untrusted | No new purchase                                | Active completed-session feedback route                           |

Public profile and equipment access must continue to work when every payment
feature flag is false. Connecting and inspecting the minimum context is free.

`create_personalized_routine` requires the person’s bounded natural-language
`goal`, accepts an optional published `templateId`, and—when no entitlement
exists—accepts `paymentMode: "human_checkout" | "agent_wallet"`. If the template
is omitted, Gym deterministically selects one published staff template from the
goal and active minimum context; it does not invent exercise content. The tool
defaults an omitted WebMCP payer to the sandbox demo agent when that mode is
available, then pauses on the same first-party payment confirmation. The tool
never accepts patient, owner, price, currency, entitlement, provider, merchant,
wallet, destination, chain, token, RPC, or capability as input.

## Server-authoritative preparation

Consequential tools may define a read-only preparation phase:

```ts
prepareMutation(input, context) => {
  confirmation: {
    title: string;
    description: string;
    fields: Array<{ label: string; value: string }>;
    riskClass: "payment" | "account-write";
  };
  quoteDigest?: string;
}
```

The sequence is:

```text
validate input
→ read current authority, entitlement, order, and offer
→ render first-party confirmation
→ person approves
→ server recomputes and compares quote
→ execute at most one write/provider attempt
```

Preparation performs no write. Decline creates no order, provider setup, budget
reservation, entitlement, or routine. A changed quote requires a fresh review.
An entitled owner sees an `account-write` confirmation without a payment.

The no-entitlement confirmation asks an explicit payment question and shows
the free/paid boundary, product, **$4.99 test USD**, payer, sandbox status,
effect, and unchanged data scope. Human mode ends with
**Continue to secure test checkout**. Agent mode ends with
**Approve agent payment**.

## Protected server envelope

Passport responses use a bounded no-store envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "synthetic": true,
    "asOf": "2026-08-29T00:00:00.000Z",
    "requestId": "req_opaque"
  }
}
```

Errors use `ok: false`, a stable safe code, and a request ID. Core codes are
`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION`, `EXPIRED`,
`CONFLICT`, and `UNAVAILABLE`. Commerce may additionally return
`PAYMENT_REQUIRED`, `ORDER_PENDING`, `QUOTE_CHANGED`, `PAYMENT_REPLAY`,
`BUDGET_EXCEEDED`, `PROVIDER_SETUP_PENDING`,
`PROVIDER_SETUP_RECONCILIATION_REQUIRED`, `RECONCILIATION_REQUIRED`,
`FULFILLMENT_PENDING`, or `PAYMENT_FAILED`.

No structured WebMCP output, log, or execution trace may contain a raw context
code, capability, credential, receipt, provider request snapshot, Checkout
Session ID, Stripe signature, private key, cookie, authorization header,
database URL, or health projection outside the approved minimum. The
first-party human Checkout path may receive an allowlisted Stripe-hosted HTTPS
redirect URL; treat it as sensitive navigation data and never include it in a
tool result or log.

## Fetch and output requirements

Every handler that calls a server route must:

1. pass strict input validation;
2. use `cache: "no-store"` where applicable;
3. pass the execution `AbortSignal`;
4. require an expected content type and bounded schema-valid envelope;
5. reject non-2xx responses as stable errors;
6. stop dependent calls after any error;
7. cap the serialized result at 1,500 characters.

Manufacturer data, source text, and user-authored notes retain the
`untrustedContentHint`. Tool names stay within 30 characters, descriptions
within 500, and parameter descriptions within 150.
