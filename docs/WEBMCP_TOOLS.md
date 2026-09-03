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

| Tool                      | Type            | Available when                               | Result or effect                               |
| ------------------------- | --------------- | -------------------------------------------- | ---------------------------------------------- |
| `get_my_passport_summary` | Read            | Owner is viewing the own Passport            | Bounded synthetic summary; no source bodies    |
| `list_my_shares`          | Read            | Owner views sharing                          | Current owner grants and scopes                |
| `create_context_grant`    | Confirmed write | Owner reviews exact goal plus Gym projection | One-use, 1–20 minute purpose-bound handoff     |
| `revoke_access_grant`     | Confirmed write | Owner selects an active grant                | Idempotent revocation and redacted audit event |

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

## Adaptive Gym: eight tools total

| Tool                          | Type                       | Payment                                        | Route/state behavior                                      |
| ----------------------------- | -------------------------- | ---------------------------------------------- | --------------------------------------------------------- |
| `get_gym_profile`             | Public read                | Never                                          | Public home, catalog, and routine surfaces                |
| `search_equipment`            | Public read, untrusted     | Never                                          | Updates the existing catalog controls/cards               |
| `get_equipment`               | Public read, untrusted     | Never                                          | Opens an existing `/equipment/[slug]` record              |
| `get_active_context`          | Read                       | Never                                          | Only after a valid one-use Passport handoff               |
| `get_routine_pro_offer`       | Read                       | Never                                          | Active context; bounded server-authoritative offer        |
| `get_routine_pro_status`      | Read, untrusted            | Never                                          | Active context; pending and fulfilled order recovery      |
| `create_personalized_routine` | Confirmed mutation         | Existing entitlement or approved sandbox payer | Existing Session Planner exact-preview/result canvas only |
| `record_session_feedback`     | Confirmed write, untrusted | No new purchase                                | Active completed-session feedback route                   |

Public profile and equipment access must continue to work when every payment
feature flag is false. Connecting and inspecting the minimum context is free.

## Agent-generated personalized-routine contract

`create_personalized_routine` never asks Gym or Passport to generate exercise
content. The calling external agent must:

1. read `get_active_context`;
2. inspect relevant current equipment through `search_equipment` and
   `get_equipment`;
3. combine only those results with the user's natural-language request in the
   agent's own reasoning context;
4. generate a completely new structured routine;
5. never invent equipment, manufacturer facts, links, models, specifications,
   medical clearance, or professional approval;
6. preserve uncertainty around injury and undocumented clearance; and
7. show the exact proposal and obtain explicit confirmation before submission.

The mutation accepts no `templateId`. Its closed input is:

```ts
{
  goal: string;
  paymentMode?: "human_checkout" | "agent_wallet";
  routine: {
    title: string;
    durationMinutes: number;
    exercises: Array<{
      equipmentId: string;
      durationMinutes: number;
      intensity: "easy" | "moderate";
      instructions: string[];
      adaptationReason: string;
    }>;
    warmup?: string[];
    cooldown?: string[];
    safetyNotes: string[];
    requiresExpertReview: boolean;
    expertReviewReason?: string;
  };
}
```

Gym treats that structure as untrusted. Before a charge or save it verifies
current catalog existence and availability, bounded count/duration/text,
confirmed-goal equality, preserved Passport stop signals, absence of medical-
clearance claims, and required professional review for injury, rehabilitation,
or unknown-clearance scenarios. Gym hydrates canonical names, models, links,
and specifications from its own catalog. The provenance marker
`webmcp_agent_generated@1.0` never loads predefined routine content.

`get_active_context` also returns `routineBounds` (maximum duration derived
from the preferred session length, exercise count, per-exercise minutes,
transition allowance, allowed intensities, and the expert-review rule) so the
agent can shape a valid proposal first. The same validation runs during the
read-only preparation, before any confirmation dialog, and again on the server.
A failing routine is rejected with a bounded, specific reason (for example an
unknown `equipmentId` or a missing `requiresExpertReview`) and no payment is
attempted; the agent corrects the routine and calls again.

The Gym site also offers Routine Pro to a person without an agent. That path is
not a WebMCP tool: the person chooses a published staff walkthrough, and the
request carries `initiatedVia: "site-ui"` with a `templateId`. It is saved and
labeled as a staff walkthrough chosen on the Gym site, never as agent-generated.

For a review-required draft, the first-party UI and saved Passport record show:

> **AI-generated personalized draft. A physician or qualified physical therapist
> should review and approve this routine before it is performed.**

## Read-only payment and save recovery

`get_routine_pro_status` returns the latest relevant order for the active Gym
session, including fulfilled orders. An optional opaque `orderRef` may narrow
the read to the same active session. Safe fields include:

```ts
{
  orderRef?: string;
  orderStatus?: string;
  amountMinor?: 499;
  currency?: "usd";
  provider?: "mpp_tempo" | "stripe_checkout";
  payerLabel?: string;
  sandbox?: true;
  submittedAt?: string;
  paidAt?: string;
  fulfilledAt?: string;
  providerPaymentRef?: string;
  entitlementGranted: boolean;
  routineSaved: boolean;
  savedRoutineRef?: string;
  terminal: boolean;
  recoveryInstruction: string;
}
```

Order states fall into three groups. `payment_submitted` and
`reconciliation_required` mean a payment left the site with an unknown
outcome: poll only, never resubmit. `created`, `provider_pending`, and
`paid_unfulfilled` are resumable: no payment was submitted, or it was verified
but not yet fulfilled, so calling `create_personalized_routine` again with the
exact confirmed routine resumes the same order or completes fulfillment and
never creates a second charge. `fulfilled` and the failed/voided/refunded
states are terminal. The result carries `resumable`, `terminal`, and
`recoveryInstruction` so the agent does not have to infer this.

Only one payable order may exist per patient. When a person reconnects with a
new one-use context, status also surfaces a payable order left by an earlier
Gym session (`orderScope: "earlier_session"`). An unpaid earlier-session order
is released automatically when the exact routine is submitted for the new
session; a verified but unfulfilled one is fulfilled locally; a submitted
payment with an unknown outcome still blocks until it is reconciled.

It never returns private keys, credentials, capabilities, raw receipt headers,
receipt digests, authorization headers, provider request snapshots, or payment
secrets. After a timeout, call this read-only tool before any other payment
action. Poll only while the order is non-terminal. Never submit a second
payment for a pending, paid, or fulfilled order.

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
validate closed input
→ read current context, equipment, authority, entitlement, order, and offer
→ render the complete exact routine in first-party confirmation
→ person approves that routine, payer, price, sandbox network, and Passport save
→ server revalidates routine, quote, and authority
→ stage exact validated plan
→ execute at most one provider attempt
→ atomically grant entitlement and save the same plan
```

Preparation performs no write. Decline creates no order, provider setup, budget
reservation, entitlement, or routine. A changed quote or status requires a fresh
review. An entitled owner sees an `account-write` confirmation without a new
payment.

The no-entitlement confirmation shows the complete proposed routine, approved
Passport context, canonical selected equipment, professional-review boundary,
product, **$4.99 test USD**, payer, sandbox network, Passport save destination,
and unchanged data scope. Human mode opens the Stripe test checkout only after
approval. Agent mode approves the Adaptive World demo agent wallet and MPP /
Tempo testnet payment only after approval.

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
`PAYMENT_REQUIRED`, `ORDER_PENDING`, `QUOTE_CHANGED`, `ROUTINE_CONFLICT`,
`PAYMENT_REPLAY`, `BUDGET_EXCEEDED`, `PROVIDER_SETUP_PENDING`,
`PROVIDER_SETUP_RECONCILIATION_REQUIRED`, `RECONCILIATION_REQUIRED`,
`FULFILLMENT_PENDING`, or `PAYMENT_FAILED`.

No structured WebMCP output, log, or execution trace may contain a raw context
code, capability, credential, receipt header, receipt digest, provider request
snapshot, Checkout Session ID, Stripe signature, private key, cookie,
authorization header, database URL, or health projection outside the approved
minimum. The safe status tool may return the opaque public order reference and
provider payment/transaction reference needed for the visible sandbox receipt.
The first-party human Checkout path may receive an allowlisted Stripe-hosted
HTTPS redirect URL; treat it as sensitive navigation data and never include it
in a tool result or log.

## Fetch and output requirements

Every handler that calls a server route must:

1. pass strict input validation;
2. use `cache: "no-store"` where applicable;
3. pass the execution `AbortSignal`;
4. require an expected content type and bounded schema-valid envelope;
5. reject non-2xx responses as stable errors;
6. stop dependent calls after any error; and
7. cap serialized results at the configured surface limit.

Manufacturer data, source text, user-authored notes, and agent-authored routine
text retain the `untrustedContentHint`. Tool names and schema descriptions stay
within the adapter's validated limits.
