# Hackathon demo script

Target length: 4–6 minutes. Run entirely with synthetic data.

## Preflight

- Open the exact production URLs for Passport and Gym in separate tabs.
- Confirm both show **Synthetic demo — not for clinical use**.
- Sign in as the prepared patient and clinician demo users in separate browser profiles.
- Confirm Chrome exposes WebMCP and DevTools lists the expected tools for each page.
- Reset the selected context grant and session fixture.
- Keep a standard-UI fallback ready; do not represent DOM automation as WebMCP.

## 1. The problem (30 seconds)

Show the Passport and explain: people repeatedly copy sensitive context into prompts, while websites know their capabilities but not the user's relevant constraints. Adaptive World joins those sides with permission and minimum disclosure.

## 2. Owner-controlled Passport (60 seconds)

On Mateo's Passport, ask the agent:

> Summarize my current goals and tell me what I am sharing.

Verify calls to `get_my_passport_summary` and `list_my_shares`. Show that the ordinary UI reflects the same state.

Then choose **Use in Adaptive Gym**. Pause on the first-party review and point out what is included and excluded. Confirm to create the one-time grant.

## 3. Minimum context exchange (45 seconds)

Open Gym and redeem the context. Explain that the exchange code is one-time and short-lived; Gym receives a temporary projection rather than a medical record.

Ask:

> What relevant context do you have for this session?

Verify `get_active_context`. Highlight the absence of name, documents, medication, and lab values.

## 4. Real environment matching (75 seconds)

Ask:

> Build a 45-minute strength and cardio session using only equipment this gym actually has. Respect my preferences and minor shoulder constraint.

Expected sequence:

1. `get_active_context`
2. `search_equipment`
3. `get_equipment` for only the shortlisted records
4. `create_session_draft`

Show that every recommendation links to a catalog record and that the draft remains editable in the UI.

## 5. Progressive clinical access (60 seconds)

In the clinician profile, search:

> Find my patient Mateo and show what changed since the last visit. Open only the source supporting the vitamin D finding.

Expected sequence: `search_my_patients`, `get_patient_changes`, then one `open_patient_source`. Explain that a clinician cannot search the global Passport population, and source text is untrusted.

Optionally prepare a guidance note and cancel at the confirmation screen to demonstrate that the agent cannot silently write.

## 6. Security proof (45 seconds)

- Attempt to redeem the same Gym code again: it must fail.
- Show the access log containing creation, redemption, denial, and revocation metadata without sensitive payloads.
- In DevTools, show route-specific registration: medical tools do not appear on Gym.

## Closing (20 seconds)

Adaptive World turns static data into consented, purpose-bound context: **Understand → Match → Act → Measure → Adapt**, while the user remains in control.

## Recovery lines

- If WebMCP is unavailable: state that the browser did not expose the registry and use the standard UI; never claim a WebMCP call occurred.
- If a tool returns `UNAVAILABLE`: show the structured error and stop the dependent chain.
- If a demo account drifts: use the reset fixture rather than editing production data live.
- If an agent proposes unavailable equipment: reject the draft and run AW-EVAL-013 after the demo.
