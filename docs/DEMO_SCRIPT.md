# Final judge demo script

Target length: **2:54**. Use only synthetic data and sandbox/test payment rails.

Opening title:

> **Understand the person. Understand the place. Act—with permission.**

Submission title:

> **Adaptive World: Permissioned agents for the physical world**

The judged story is only Digital Passport → Adaptive Gym → bounded MPP testnet
payment → grounded routine saved to Passport. Stripe, clinician workflows,
revocation, generic URL permissions, and other recipients are outside the timed
path.

## Preflight

- Confirm both Production aliases resolve to the immutable commit targeted by
  `judge-release-2026-08-30`.
- Use the latest ChatGPT Desktop release, a currently supported model, and a clean
  conversation with Site tools enabled.
- Keep Passport `/sharing` open for Prompt 1. Keep Gym `/session` open for Prompt 2;
  page tools do not transfer between websites.
- Restore the canonical synthetic fixture as the demo operator. Stop if reset
  reports unresolved payment reconciliation.
- Sign in as `mateo.demo@adaptiveworld.test` and start on Passport `/sharing`.
- Confirm free Gym discovery works, Routine Pro is enabled, Stripe is disabled,
  and only the bounded MPP testnet payer is enabled.
- Rehearse Production only through the payment confirmation, cancel, and verify
  that no order, reservation, entitlement, or routine was created.
- Keep the ordinary human UI path available. Never describe a UI click or DOM
  automation as a WebMCP invocation.

## The two prompts

### Prompt 1 — Passport `/sharing`

```text
Connect my Passport to Adaptive Gym so I can support lifelong health without bodybuilding-style muscle gain.
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
**Passport goals**. Then use the ordinary **Choose a walkthrough** navigation.

### Prompt 2 — Gym `/session`

```text
First inspect this Gym’s profile and verified equipment. Then use my approved context to create and save the best staff-authored routine for this goal: support lifelong health without bodybuilding-style muscle gain.
```

Expected chain:

```text
get_gym_profile
→ search_equipment
→ get_active_context
→ get_routine_pro_offer
→ create_personalized_routine
```

Do not name a template ID or payment mode. Gym must select a published staff
template from the approved context. The application must still pause for exact
first-party payment approval.

Use this backup only if discovery completes but Routine Pro is not prepared:

```text
Now create and save the best staff-authored routine for my approved goal.
```

## Timed recording

| Time      | Screen                                                                                                                                                         | Narration                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:06 | Begin on the completed routine. Show `Requested via WebMCP`, template and catalog versions, and `Saved to Passport ✓`; then cut to Passport.                   | “Adaptive World lets an agent act for me without owning my identity or receiving a wallet key.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 0:06–1:00 | Show the Passport dashboard, movement context, and Sharing. A small face-camera bubble may remain visible during this personal introduction.                   | “About ten years ago, a psychotic episode led me to live on the streets and later be hospitalized in Mexico City. Rebuilding took years, and programming became one of the things that helped me rebuild my life and my mental health. Three years ago, Cauda Equina Syndrome left me using a wheelchair and then crutches. A highly personalized Pilates program helped me recover my mobility. Today I feel healthy, but gyms still confuse me. Generic AI can suggest exercises, yet it does not know my history, what I choose to share, or what this particular gym actually has. So I built Adaptive World: the person controls the context, the place exposes its real capabilities through WebMCP, and the agent connects them.” |
| 1:00–1:25 | Enter Prompt 1. Pause on requested goal, movement considerations, stop signals, expiry, and excluded data; approve. Remove the face-camera bubble.             | “The demo records are synthetic, but the authorization flow is real. In my Passport, I use one sentence to state my goal and ask ChatGPT to connect me to Adaptive Gym. WebMCP prepares the exact five-minute, one-use projection. Before anything leaves, I can review the goal, the movement context, and everything excluded: my name, diagnoses, medications, labs, and documents. I approve.”                                                                                                                                                                                                                                                                                                                                       |
| 1:25–1:38 | Let the one-use handoff open Gym. Show the highlighted request separately from Passport goals, then select **Choose a walkthrough**.                           | “The Gym redeems it once into an anonymous session and shows the exact goal I approved, separately from my Passport goals.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1:38–1:56 | Open Gym’s WebMCP execution drawer, enter Prompt 2, and make the real tool names legible as they execute.                                                      | “Now ChatGPT uses the Gym’s WebMCP tools—not scraping—to inspect its actual catalog, read only the approved context, and select the best published staff template.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 1:56–2:17 | Pause on the application-owned confirmation. Show free tier, paid tier, exact goal, template, payer, amount, sandbox mode, and unchanged data access; approve. | “Public discovery and context review are free. The only paid step is creating and saving Routine Pro. The application shows my exact goal, the selected template, the four-dollar-and-ninety-nine-cent test price, the payer, sandbox mode, and unchanged data access. Nothing happens until I approve.”                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2:17–2:29 | Show `Paying with the Adaptive World demo agent…`. Do not show any wallet, credential, capability, receipt, provider payload, or explorer.                     | “After my approval, Adaptive World’s bounded, server-held demo wallet completes a testnet payment. ChatGPT never receives the private key, payment credential, or receipt.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2:29–2:46 | Show the exact stated goal, `Requested via WebMCP`, grounded equipment, adaptations, versions, safety signals, decision trace, and `Saved to Passport ✓`.      | “Only after verified fulfillment does the routine appear, grounded in equipment this Gym actually exposes, with template and catalog versions, safety signals, provenance, and a decision trace preserving my words. WebMCP selected a staff-authored routine; it did not invent treatment.”                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2:46–2:54 | Open the same saved record in Passport and finish on the saved routine, or Passport and Gym side by side.                                                      | “The result is saved back to my Passport. Today this is a gym. The larger pattern is simple: the place describes what it can offer, the person controls what they need, and the agent connects them.”                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Required visible proof

- The approved natural-language request is distinct from existing Passport goals.
- The handoff is one-use and the Gym session is anonymous.
- Public discovery and context review are free.
- Routine Pro is the only paid effect.
- The first-party confirmation shows the exact goal, selected template, payer,
  amount, sandbox mode, and unchanged data scope.
- The MPP wallet, capability, credential, key, and receipt never become model
  inputs, WebMCP outputs, or visible recording content.
- The completed routine is grounded in verified Gym equipment and a published
  staff template, includes provenance and safety signals, and persists back to
  Passport.

## Recovery boundaries

- **WebMCP unavailable:** “This browser did not expose Site tools. The standard
  accessible UI still works; no WebMCP execution is being claimed.”
- **Provider disabled:** “Free public discovery remains available. The sandbox
  payment adapter is intentionally fail-closed.”
- **Order pending:** resume the existing payer state; never open another rail.
- **Ambiguous MPP payment:** preserve the submitted budget reservation and stop
  with `RECONCILIATION_REQUIRED`.
- **Reset conflict:** do not delete evidence or improvise database edits. Reconcile
  the synthetic provider state first.
- **Account drift:** use the authenticated synthetic reset, not live manual edits.

## Submission wording

Use the complete thesis:

> **Adaptive World demonstrates that an agent can understand what a person has
> chosen to share without owning their identity, understand what a place can
> actually offer without scraping or guessing, and complete one explicitly
> approved paid action without ever receiving the wallet key.**

Do not say that WebMCP transfers the Passport, that ChatGPT owns or autonomously
spends from the wallet, that payment expands health-data access, or that the
routine is diagnosis, treatment, medical clearance, or guaranteed safe.
