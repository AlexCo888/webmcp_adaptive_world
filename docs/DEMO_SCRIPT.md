# Hackathon demo script

Target length: **2:58**. Use only synthetic data and sandbox/test payment rails.
The primary story is Digital Passport → Adaptive Gym; the clinician workspace
is a secondary authorization proof, not part of the timed path.

## Preflight

- Record the exact Git SHA deployed to both production aliases.
- Open both aliases from a clean Chrome profile without Vercel deployment protection.
- Confirm `document.modelContext` is available and the WebMCP panel shows the expected route tools.
- Sign in as the clinician demo operator, `elena.vargas@adaptiveworld.test`, and use
  **Tools → Restore synthetic demo**.
- Confirm the reset did not report unresolved payment reconciliation.
- Sign out, then sign in as the Passport owner, `mateo.demo@adaptiveworld.test`, for the
  primary journey.
- Verify the free Gym catalog works with every payment feature flag disabled.
- Complete and record one Stripe test-mode and one bounded MPP testnet smoke before filming.
- Keep the ordinary UI fallback ready. Never describe UI clicks or DOM automation as WebMCP calls.

## Timed path

| Time      | Scene and proof                                                                                                                                                                                                                                                                                                              |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0:00–0:18 | Explain the problem: agents either guess from pages or receive too much personal context. State the boundary—public Gym understanding is free; personal action is permissioned.                                                                                                                                              |
| 0:18–0:45 | At Gym, invoke `get_gym_profile` and `search_equipment`. The existing catalog controls and cards visibly update before any Passport or payment.                                                                                                                                                                              |
| 0:45–1:08 | At Passport, ask for a five-minute Adaptive Gym handoff. Pause on the first-party review, approve it, and show what is excluded. Redeem the one-use fragment at Gym.                                                                                                                                                         |
| 1:08–1:28 | Ask naturally: “Create a routine from my Passport for lifelong health without bodybuilding-style muscle gain.” Invoke `get_active_context`, `get_routine_pro_offer`, then `create_personalized_routine`. Show the exact goal, selected staff template, $4.99 test USD payer, sandbox mode, effect, and unchanged data scope. |
| 1:28–1:48 | Approve **Adaptive World demo agent** payment. Show only a redacted 402 → credential → verified receipt state; never reveal capability, credential, key, receipt, wallet address, or provider payload.                                                                                                                       |
| 1:48–2:18 | The existing Session Planner canvas fills with the grounded routine and displays **Saved to Passport ✓**. No second agent-results UI appears.                                                                                                                                                                                |
| 2:18–2:38 | Show template/catalog versions, decision trace, safety notes, and manufacturer provenance. Explain that a published template was selected; no diagnosis or treatment was generated.                                                                                                                                          |
| 2:38–2:52 | Open Passport → **Saved routines** and show the same owner-authorized record.                                                                                                                                                                                                                                                |
| 2:52–2:58 | Close: free public understanding, minimum context, explicit approval, one sandbox entitlement, and no broader health access.                                                                                                                                                                                                 |

Expected primary chain:

```text
get_gym_profile
→ search_equipment
→ get_active_context
→ get_routine_pro_offer
→ create_personalized_routine
```

The first two tools require neither payment nor Passport. The final mutation
must pause on the application-owned confirmation. Declining must create no
order, provider setup, budget reservation, entitlement, or routine.

The model should pass the person’s sentence as `goal`. It may omit `templateId`;
Gym then selects the best matching published template from the active minimum
context. It may also omit `paymentMode`; the WebMCP flow selects the demo agent
sandbox wallet when available and still pauses for exact first-party approval.
The saved plan and decision trace must preserve that exact goal.

## Backup human-payer proof

Keep a screenshot or short backup clip—not a second primary demo—showing
**Continue to secure test checkout**, Stripe Checkout in test mode, redirect
without unlock, verified webhook fulfillment, and automatic routine retry.

## Optional clinician proof

If asked, sign in as `elena.vargas@adaptiveworld.test` and show exactly five
clinician tools. Demonstrate that an already-open clinician page loses access on
its next server-authoritative invocation after the owner revokes the grant. Do
not reload and do not use a simulated change query.

## Recovery lines

- **WebMCP unavailable:** “This browser did not expose the WebMCP registry. The standard accessible UI still works; no WebMCP execution is being claimed.”
- **Provider disabled:** “Free public discovery remains available. The sandbox payment adapter is intentionally fail-closed.”
- **Order pending:** resume the existing payer state; never open another rail.
- **Ambiguous Stripe setup:** stop with `PROVIDER_SETUP_RECONCILIATION_REQUIRED`; never rotate a stale idempotency key.
- **Ambiguous MPP payment:** retain the submitted budget reservation and stop with `RECONCILIATION_REQUIRED`.
- **Reset conflict:** do not delete evidence or improvise database edits. Reconcile the synthetic provider state first.
- **Account drift:** use the authenticated synthetic reset, not live manual edits.

## Submission wording

Use:

> WebMCP exposes purpose-appropriate tools inside each website. Adaptive World's
> one-use consent protocol carries the minimal projection between Passport and
> Gym.

Do not say WebMCP transfers the Passport, that payment expands medical access,
or that fixture validation proves model behavior.
