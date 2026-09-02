# Final judge demo script

Target length: **2:54**. Use only synthetic data and sandbox/test payment rails.

Opening title:

> **Understand the person. Understand the place. Act—with permission.**

Submission title:

> **Adaptive World: Permissioned agents for the physical world**

The judged story is only Digital Passport → Adaptive Gym → external-agent
routine generation → exact first-party confirmation → bounded MPP testnet
payment → visible receipt → routine saved to Passport. Stripe, clinician
workflows, revocation, generic URL permissions, and other recipients are outside
the timed path.

## Preflight

- Confirm both Production aliases resolve to the immutable commit targeted by
  the release evidence ledger.
- Use the latest supported ChatGPT browser experience, a currently supported
  model, and a clean conversation with Site tools enabled.
- Keep Passport `/sharing` open for Prompt 1. Keep Gym `/session` open for Prompt
  2; page tools do not transfer between websites.
- Restore the canonical synthetic fixture as the demo operator. Stop if reset
  reports unresolved payment reconciliation.
- Sign in as `mateo.demo@adaptiveworld.test` and start on Passport `/sharing`.
- Confirm free Gym discovery works, Routine Pro is enabled, Stripe is disabled,
  and only the bounded MPP testnet payer is enabled.
- Rehearse Production only through the payment confirmation, cancel, and verify
  that no provider submission, entitlement, or saved routine was created.
- Keep the ordinary human UI visible. Never describe a UI click or DOM
  automation as a WebMCP invocation.

## The two prompts

### Prompt 1 — Passport `/sharing`

```text
Connect my Passport to Adaptive Gym so I can create a cautious personalized routine. Share only the minimum Gym projection I approve; do not share my identity, documents, medications, labs, or unrelated medical information.
```

Expected mutation:

```text
create_context_grant
```

Pause on the first-party confirmation and show:

- requested routine goal;
- movement considerations;
- stop signals;
- five-minute expiry; and
- information that is not shared.

Approve **Share with Gym**. At Gym, show `Passport member`, `One-use grant
redeemed`, the highlighted **Requested routine goal**, and the separately labeled
**Passport goals**. Then open **Build a session**.

### Prompt 2 — Gym `/session`

```text
First read the Gym profile and only my approved Passport projection. Search and inspect the real equipment that is currently available. Mateo broke his leg three months ago and recovered quickly, but weight-bearing clearance is undocumented. Generate a completely new cautious structured routine yourself from my request, the approved projection, and the verified Gym inventory. Do not invent equipment or claim medical clearance. Mark it for physician or qualified physical-therapist review. Show me the complete proposed routine before asking me to approve the $4.99 test USD Adaptive Routine Pro payment with the Adaptive World demo agent wallet and saving it to Passport.
```

Expected chain:

```text
get_gym_profile
→ get_active_context
→ search_equipment
→ get_equipment (for every selected item)
→ get_routine_pro_offer
→ external agent generates a new structured routine in its own reasoning context
→ create_personalized_routine
```

The Gym application must not select a template or call a model. The external
agent supplies the actual routine content. The application must pause on a
first-party confirmation containing that complete exact routine before any paid
write.

Use this backup only if discovery completes but the mutation is not prepared:

```text
Now show the exact new routine you generated, including equipment IDs, instructions, adaptation reasons, safety notes, and the professional-review warning. Then prepare that exact routine for the confirmed sandbox payment and Passport save.
```

## Timed recording

| Time      | Screen                                                                                                                                                                         | Narration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:06 | Begin on the completed routine. Show `Agent-generated via WebMCP`, verified equipment, receipt, and `Saved to Passport ✓`; then cut to Passport.                               | “Adaptive World lets a user-selected agent act for me without owning my identity or receiving a wallet key.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 0:06–1:00 | Show the Passport dashboard, movement context, and Sharing. A small face-camera bubble may remain visible during this personal introduction.                                   | “About ten years ago, a psychotic episode led me to live on the streets and later be hospitalized in Mexico City. Rebuilding took years, and programming became one of the things that helped me rebuild my life and my mental health. Three years ago, Cauda Equina Syndrome left me using a wheelchair and then crutches. A highly personalized Pilates program helped me recover my mobility. Today I feel healthy, but gyms still confuse me. Generic AI can suggest exercises, yet it does not know my history, what I choose to share, or what this particular gym actually has. So I built Adaptive World: the person controls the context, the place exposes its real capabilities through WebMCP, and the agent connects them.” |
| 1:00–1:25 | Enter Prompt 1. Pause on requested goal, movement considerations, stop signals, expiry, and excluded data; approve. Remove the face-camera bubble.                             | “The demo records are synthetic, but the authorization flow is real. My Passport prepares the exact five-minute, one-use projection. Before anything leaves, I can review the goal, movement context, and everything excluded: my name, diagnoses, medications, labs, and documents. I approve.”                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 1:25–1:38 | Let the one-use handoff open Gym. Show the highlighted request separately from Passport goals, then open **Build a session**.                                                  | “The Gym redeems it once into an anonymous session and shows the exact purpose I approved, separately from my Passport goals.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 1:38–1:56 | Open Gym’s WebMCP execution drawer, enter Prompt 2, and make the real tool names legible. Show profile, context, equipment search, and item inspection.                        | “Now ChatGPT uses the Gym’s WebMCP tools—not scraping—to read only the approved context and inspect the equipment this Gym actually has. ChatGPT itself combines that context with my request and generates a completely new routine. The Gym never calls a model.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1:56–2:17 | Pause on the application-owned confirmation. Show the complete proposed routine, approved context, canonical equipment, warning, payer, **$4.99 test USD**, sandbox, and save. | “Before any payment, the application shows the exact routine ChatGPT generated: every equipment block, instruction, adaptation, safety note, and the professional-review warning. It also shows the price, Adaptive World demo agent, Tempo testnet, and that this exact draft will be saved to Passport. Nothing happens until I approve this exact proposal.”                                                                                                                                                                                                                                                                                                                                                                          |
| 2:17–2:29 | Approve. Show payment progress, then the visible receipt. Do not show any wallet key, credential, capability, raw receipt header, or provider request payload.                 | “After my approval, Adaptive World validates the untrusted structure against its live catalog and uses its bounded server-held demo wallet for one testnet payment. ChatGPT never receives the private key or payment credential.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 2:29–2:46 | Show `Payment confirmed`, order and transaction references, paid/fulfilled times, entitlement, saved status, then the exact agent-generated routine and prominent warning.     | “The receipt proves the sandbox order was fulfilled, the entitlement was granted, and the exact routine was saved. The content is new and agent-generated, while Adaptive Gym supplies canonical equipment facts, preserves Passport stop signals, and requires physician or qualified physical-therapist review because weight-bearing clearance is undocumented.”                                                                                                                                                                                                                                                                                                                                                                      |
| 2:46–2:54 | Open the same saved record in Passport and finish on `Agent-generated via WebMCP`, or show Passport and Gym side by side.                                                      | “The same result is saved back to my Passport. Today this is a gym. The larger pattern is simple: the place describes what it can offer, the person controls what they need, and their chosen agent supplies the intelligence.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

## Required visible proof

- The approved natural-language request is distinct from existing Passport goals.
- The handoff is one-use and the Gym session is anonymous.
- Public discovery and context review are free.
- The external agent generates the actual exercise content; Gym and Passport do
  not call an AI model or select a personalized template.
- The first-party confirmation shows the complete exact routine, approved
  Passport context, verified selected equipment, professional-review warning,
  payer, **$4.99 test USD**, sandbox network, Passport save, and unchanged data
  scope.
- The MPP wallet, capability, credential, and key never become model inputs,
  WebMCP outputs, or visible recording content.
- The completed routine displays `Agent-generated via WebMCP`, verified Gym
  equipment, Passport stop signals, professional-review status, and saved
  provenance.
- The receipt displays payment confirmation, product, amount, payer, provider,
  order reference, transaction reference, paid/fulfilled timestamps,
  entitlement granted, and routine saved to Passport.
- If a human buys Routine Pro on the site without an agent, the result is
  labeled `Staff walkthrough chosen on the Gym site`, never
  `Agent-generated via WebMCP`. Do not use the site path in the recorded demo
  as evidence of agent generation.

## Recovery boundaries

- **WebMCP unavailable:** “This browser did not expose Site tools. The standard
  accessible UI still works; no WebMCP execution is being claimed.”
- **Provider disabled:** “Free public discovery remains available. The sandbox
  payment adapter is intentionally fail-closed.”
- **Mutation timeout or order pending:** call `get_routine_pro_status`; show
  **Payment confirmation is being recovered. We will not submit another
  payment.** Poll only while the order is non-terminal.
- **Fulfilled recovery:** use the status result and visible receipt. Never call
  `create_personalized_routine` again for the same paid order.
- **Ambiguous MPP payment:** preserve the submitted budget reservation and stop
  with `RECONCILIATION_REQUIRED`; do not submit a second payment.
- **Reset conflict:** do not delete evidence or improvise database edits.
  Reconcile the synthetic provider state first.
- **Account drift:** use the authenticated synthetic reset, not live manual edits.

## Submission wording

Use the complete thesis:

> **Adaptive World demonstrates that an agent can understand what a person has
> chosen to share without owning their identity, understand what a place can
> actually offer without scraping or guessing, generate a new proposal in the
> agent's own context, and complete one explicitly approved paid action without
> ever receiving the wallet key.**

Do not say that WebMCP transfers the Passport, that ChatGPT owns or autonomously
spends from the wallet, that Gym generates the routine, that payment expands
health-data access, or that the routine is diagnosis, treatment, medical
clearance, physician-approved, or guaranteed safe.
