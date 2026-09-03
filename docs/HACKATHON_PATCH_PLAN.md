# WebMCP Hackathon Patch Plan

Status: historical source plan; payment/product details are superseded by
[`FIXES_AND_PAYMENT.md`](./FIXES_AND_PAYMENT.md), while its P0/P1 correction
requirements remain mandatory.
Baseline: `main` at `ce5451b24433ab5db5b878db187a0f30d09cf906`.
Primary objective: maximize judging quality and submission reliability without adding UI/UX noise

## 1. Product decision

The winning demo is **Digital Passport → Adaptive Gym**:

> A person approves the minimum useful context in one website. A one-use handoff carries only that projection to another website. The agent then uses the receiving website's own WebMCP tools to search verified inventory and prepare a visible, staff-authored experience—without receiving the complete Passport.

The clinician workspace remains a strong secondary proof of role- and scope-aware WebMCP. It should not compete with the Passport-to-Gym story for demo time.

This patch cycle must improve four things only:

1. Submission eligibility.
2. Correctness and fresh authorization.
3. Judge-proof demo reliability.
4. Visible proof that WebMCP changes the same interface the person is using.

Do **not** add another domain, another product surface, a built-in chatbot, additional synthetic patients, more equipment, or more tools merely to increase the feature count.

---

## 2. UI/UX change gate

UI work is allowed only when it is necessary to prove WebMCP value or prevent a judge from getting stuck.

### Allowed UI changes

- Reuse the existing catalog controls and cards when an agent invokes `search_equipment`.
- Reuse the existing equipment detail route when an agent invokes `get_equipment`.
- Reuse the existing Session Planner result canvas when an agent invokes `create_personalized_routine`.
- Reuse the existing modal pattern for human confirmation and demo reset.
- Add a small demo-reset control only inside the existing `/tools` developer/inspection surface.
- Add transient focus/highlight and a visually hidden `aria-live` status after an agent action.
- Correct misleading copy, counts, claims, and demo instructions.

### Prohibited UI changes

- No chat widget.
- No new dashboard.
- No new primary navigation item.
- No persistent global banner.
- No badge on every card.
- No second WebMCP inspector.
- No toast for every read call.
- No design-system rewrite.
- No decorative animation or WebGL work.
- No new onboarding flow.

### Visual acceptance rule

After the patch, a normal visitor who never uses WebMCP should see essentially the same product. The only permanent addition should be the narrowly placed demo-maintenance action inside `/tools`. Agent-driven changes should reuse existing UI and disappear or reset naturally.

---

## 3. Priority stack

| Priority | Patch                                           | Why it matters                                               |
| -------- | ----------------------------------------------- | ------------------------------------------------------------ |
| P0       | License and submission compliance               | Eligibility blocker                                          |
| P0       | Server-authoritative Passport/doctor reads      | Revocation and scope changes must take effect without reload |
| P0       | Fix Gym grant expiry contract                   | Current tool response can disagree with persisted expiry     |
| P0       | Remove simulated clinician-delta behavior       | Trust is more valuable than tool count                       |
| P0       | Add deterministic demo reset                    | Shared judge accounts must not break later evaluations       |
| P1       | Synchronize WebMCP results with existing Gym UI | Strongest improvement to WebMCP Leverage and Execution       |
| P1       | Add full WebMCP browser tests                   | Prevent demo-only integration failures                       |
| P1       | Publish actual eval results                     | Distinguish fixture validation from behavioral evidence      |
| P1       | Rewrite the demo path to under three minutes    | Submission and judging requirement                           |
| P2       | Activate a non-owner Neon runtime role          | Valuable hardening, but only ship if fully tested            |

P0 items are release blockers. P1 items are required for the strongest submission. P2 must not destabilize the working demo.

---

## 4. Patch sequence

## Patch 1 — Submission compliance and truthful repository metadata

### Files

- Add `LICENSE` using MIT.
- Add `THIRD_PARTY_NOTICES.md`.
- Update root `package.json` with `"license": "MIT"`.
- Update `README.md`.
- Update `docs/DEMO_SCRIPT.md`.
- Update `docs/DEPLOYMENT.md`.
- Update `docs/ARCHITECTURE.md` and `docs/THREAT_MODEL.md` where they imply deployed RLS is currently an active boundary.

### Required changes

1. Make GitHub detect an open-source license.
2. Document third-party manufacturer names, source links, and image provenance. Do not imply endorsement or ownership.
3. Change the demo target from 4–6 minutes to approximately 2:50.
4. Add a top-of-README `60-second judge path` with:
   - Passport URL.
   - Gym URL.
   - Owner credentials.
   - Clinician credentials.
   - Exact reset location.
   - Browser requirement for WebMCP.
5. Describe the 17 items as **versioned WebMCP eval scenarios with structural validation** until real execution results exist.
6. State the deployed authorization model accurately:
   - Application-level authorization is enforced on each protected server request.
   - The repository includes RLS policy design.
   - Runtime RLS must not be claimed as active until a non-owner role and per-request identity are actually deployed.

### Manual repository settings

- Set the GitHub About description.
- Add topics: `webmcp`, `agentic-web`, `human-in-the-loop`, `consent`, `nextjs`, `browser-agents`, `digital-passport`.
- Confirm the license appears in GitHub's About panel.

### Acceptance criteria

- GitHub shows the MIT license.
- README makes no claim stronger than the deployed behavior.
- Demo documentation contains no path longer than three minutes.
- Third-party asset usage is documented and reviewable.
- No application UI changes.

---

## Patch 2 — Make Passport and clinician tools server-authoritative

### Problem

The current Passport and clinician read handlers derive results from React bootstrap state. A clinician page opened before a grant is revoked can continue returning stale data until reload. Tool registration is not an authorization boundary; each invocation must recheck the current server session, relationship, scopes, expiry, and revocation.

### Preferred implementation

Add a small closed-union server dispatcher rather than many duplicate endpoints.

### New files

- `apps/passport/lib/webmcp-server.ts`
- `apps/passport/lib/webmcp-client.ts`
- `apps/passport/app/api/webmcp/route.ts`
- `apps/passport/lib/webmcp-server.test.ts`

### Updated files

- `apps/passport/lib/portal-context.tsx`
- `apps/passport/lib/session.ts`
- `packages/webmcp/src/catalog/passport.ts`
- `packages/webmcp/src/catalog/doctor.ts`
- Relevant contracts and schema fixtures only when necessary

### Server contract

Use a strict discriminated union such as:

```ts
type PassportWebMcpRequest =
  | { tool: "get_my_passport_summary"; input: GetMyPassportSummaryInput }
  | { tool: "list_my_shares"; input: ListMySharesInput }
  | { tool: "search_my_patients"; input: SearchMyPatientsInput }
  | { tool: "get_patient_overview"; input: PatientInput }
  | { tool: "get_patient_section"; input: GetPatientSectionInput }
  | { tool: "open_patient_source"; input: OpenPatientSourceInput };
```

The server must never accept actor ID, owner ID, role, relationship ID, or granted scopes from tool input.

Every execution must:

1. Parse a closed schema and reject unknown properties.
2. Resolve Better Auth from the request.
3. Resolve the application actor from Neon.
4. Re-query the owned Passport or current doctor relationship.
5. Recheck grant status, exact scope, expiry, and revocation.
6. Return the minimum result required for the tool.
7. Use `Cache-Control: no-store`.
8. Return a stable bounded envelope.

Suggested envelope:

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "synthetic": true,
    "asOf": "2026-08-28T00:00:00.000Z",
    "requestId": "req_..."
  }
}
```

Suggested safe errors:

- `UNAUTHENTICATED`
- `FORBIDDEN`
- `NOT_FOUND`
- `VALIDATION`
- `EXPIRED`
- `CONFLICT`
- `UNAVAILABLE`

Unauthorized patient IDs must return the same public response whether or not the record exists.

### Client change

`PortalProvider` should retain the tool catalog and confirmation UI, but its read handlers should call `webmcp-client.ts`, which calls `/api/webmcp` with `cache: "no-store"` and validates the response. The UI bootstrap remains useful for normal rendering; it is no longer the authority for a WebMCP invocation.

Mutations may continue using their existing protected endpoints after their correctness fixes, because they already cross a server boundary.

### Acceptance criteria

- Owner tools cannot read another Passport.
- Doctor tools cannot enumerate outside `My Patients`.
- Revoking a grant in an owner browser causes the already-open doctor browser's next tool invocation to fail without reload.
- Expired relationships fail without reload.
- Tool output remains within 1,500 characters.
- The ordinary UI remains visually unchanged.

---

## Patch 3 — Fix the Gym context-grant duration contract

### Problem

`create_context_grant` accepts `expiresInMinutes`, while the prior client helper issued a fixed-duration grant and could report a different duration to the agent.

### Updated files

- `apps/passport/lib/portal-context.tsx`
- `apps/passport/app/api/context-grants/route.ts`
- `packages/webmcp/src/catalog/passport.ts`
- Relevant tests

### Implementation

1. Stop overloading the current `createGrant(recipient, scopes, days)` helper.
2. Split it into explicit operations:
   - `createDoctorAccessGrant(scopes, days)`
   - `createGymContextGrant(expiresInMinutes)`
3. Pass the validated WebMCP argument through to `/api/context-grants`.
4. Return the server's actual `expiresAt`; never recompute it client-side.
5. Return the actual approved scopes and audience from the server response.
6. Keep the one-use code out of logs, audit metadata, and tool output.
7. Preserve the fragment handoff and immediate fragment removal at the Gym.

### Tests

- Missing duration uses twenty minutes.
- One minute persists one minute.
- Ten minutes persists ten minutes.
- Values outside 1–20 minutes fail validation consistently.
- Returned expiry equals persisted expiry.
- Plaintext code is absent from stored rows and audit metadata.

### Acceptance criteria

The confirmation UI, server row, tool result, and handoff all describe the same lifetime.

---

## Patch 4 — Remove simulated change-query behavior

### Decision

Remove the hardcoded clinician-delta behavior from the hackathon MVP. The clinician story remains compelling with search, overview, progressive section access, source opening, and confirmed guidance.

### Updated files

- `packages/webmcp/src/catalog/doctor.ts`
- `packages/webmcp/tests/catalog.test.ts`
- `packages/webmcp/schemas/tool-schemas.json`
- `apps/passport/lib/portal-context.tsx`
- `docs/WEBMCP_TOOLS.md`
- `docs/EVALS.md`
- `docs/DEMO_SCRIPT.md`
- `README.md`
- `tests/evals/webmcp-evals.json`
- `tests/evals/validate.mjs` only if fixture invariants change

### Eval replacement

Keep 17 scenarios by replacing the current change-query scenario with:

> **Revoked clinician access is denied without page reload.**

Expected behavior:

1. Doctor initially has access.
2. Owner revokes the active grant.
3. Doctor invokes `get_patient_overview` from the already-open page.
4. Server returns `FORBIDDEN` or indistinguishable `NOT_FOUND`.
5. No downstream section/source tool is called.

### Acceptance criteria

- Clinician catalog exposes five truthful tools.
- Documentation and UI counts match the exact catalog.
- No prompt or demo instruction references a simulated clinician change query.
- The replacement eval proves the product's central consent claim.

---

## Patch 5 — Add judge-safe synthetic demo reset

### Problem

The public owner and clinician accounts share persisted grants, guidance, Gym sessions, context grants, and feedback. One judge can alter the state seen by the next judge.

### New files

- `packages/db/src/reset-demo.ts`
- `apps/passport/app/api/demo/reset/route.ts`
- Tests for reset authorization and canonical state

### Updated files

- `packages/db/src/index.ts`
- `apps/passport/components/views/tools-view.tsx`
- `docs/DEPLOYMENT.md`
- `README.md`

### Server behavior

The reset endpoint must:

1. Require a valid Better Auth session.
2. Allow only the known synthetic owner/doctor demo identities.
3. Require `ENABLE_DEMO_RESET=true`.
4. Use one database transaction.
5. Restore canonical active doctor relationships and grants.
6. Restore the seed guidance record.
7. Remove transient context grants.
8. Remove transient Gym sessions and feedback.
9. Remove non-seed guidance created during testing.
10. Record a redacted `demo.reset` audit event.
11. Never accept arbitrary patient IDs or SQL-like reset scope from the browser.

### Minimal UI

Add one compact secondary action inside the existing `/tools` page:

> Restore synthetic demo

It opens the existing modal style, explains what will be reset, and requires confirmation. It must not appear in the primary navigation, Passport dashboard, Gym header, or normal member flow.

### Acceptance criteria

- A judge can restore the canonical flow without developer access.
- Reset cannot affect non-demo identities.
- Reset is idempotent.
- Reset produces no new permanent UI outside `/tools`.

---

## Patch 6 — Make WebMCP visibly operate the existing Gym UI

### Goal

A successful WebMCP call should visibly affect the same interface the person is using. Do this by synchronizing state, not by adding a second agent UI.

### New file

- `apps/gym/components/gym-experience-context.tsx`

### Updated files

- `apps/gym/app/layout.tsx` or the narrowest existing shared shell wrapper
- `apps/gym/components/webmcp-bridge.tsx`
- `apps/gym/components/catalog-explorer.tsx`
- `apps/gym/components/session-planner.tsx`
- Existing CSS only for transient focus state

### A. `search_equipment`

After a successful tool call:

1. Store the normalized search intent in `GymExperienceContext`.
2. Apply it to the existing catalog controls.
3. Reuse the existing result list.
4. Scroll the existing results heading into view.
5. Temporarily outline matching cards using an existing accent color.
6. Announce the result count through a visually hidden `aria-live` region.

Do not add a permanent result banner, separate agent result list, or extra cards.

### B. `get_equipment`

After resolving a real catalog record, navigate to the existing `/equipment/[slug]` route. Do not create a new drawer or modal.

### C. `create_personalized_routine`

After the server returns the persisted session:

1. Store the session in `GymExperienceContext`.
2. Let `SessionPlanner` consume it and populate the existing result canvas immediately.
3. Scroll the existing result heading into view.
4. Preserve the existing provenance fields:
   - `createdVia: webmcp`
   - Template ID and version
   - Catalog version
   - Decision trace
   - Manufacturer source for every station

No additional badge is necessary because the current provenance row already communicates WebMCP origin.

### D. Other tools

- `get_active_context`: no visual change required beyond the existing context page.
- `record_session_feedback`: reuse the existing success state; do not add another toast.
- Read-only profile calls: execution remains visible in the existing WebMCP inspector.

### Acceptance criteria

- Agent equipment search changes the visible existing catalog.
- Agent equipment selection opens the existing product page.
- Agent session creation appears immediately in the existing session canvas.
- A normal non-WebMCP visitor sees no additional permanent UI.
- No duplicate source of product/session truth is introduced.

---

## Patch 7 — Harden WebMCP fetch and error behavior

### Updated files

- `apps/gym/components/webmcp-bridge.tsx`
- `apps/passport/lib/webmcp-client.ts`
- Shared output/error helpers where appropriate

### Required behavior

Every handler that calls `fetch` must:

1. Check `response.ok`.
2. Parse a bounded structured envelope.
3. Reject unexpected content types and invalid schemas.
4. Stop the chain after an error.
5. Never return a success-looking object containing an `error` property.
6. Respect the execution `AbortSignal` where the browser supplies one.
7. Avoid including raw server errors, stack traces, secrets, URLs with codes, or source bodies in logs.

### Acceptance criteria

- Failed API calls become stable WebMCP errors.
- A failed context read cannot be followed by session creation.
- No handler treats a 401/403 JSON body as a successful tool result.

---

## Patch 8 — Add end-to-end WebMCP tests

### New files

- `tests/e2e/webmcp.spec.ts`
- `tests/e2e/model-context-shim.ts`

### Updated files

- `playwright.config.ts` only if multiple authenticated projects/fixtures are needed
- `.github/workflows/ci.yml` only if the existing `pnpm e2e` command does not already include the new suite

### Model-context shim

Use `page.addInitScript` to expose a deterministic test implementation of `document.modelContext` that:

- Captures registered tools.
- Stores registration signals.
- Allows tests to invoke the registered `execute` function.
- Records exact inputs, outputs, errors, and unregistration.

The shim tests integration mechanics; it does not pretend to be a model-selection eval.

### Required journeys

1. Owner home registers only owner read tools.
2. Sharing registers the two owner mutations.
3. Route change unregisters previous tools.
4. Doctor cannot see owner or Gym tools.
5. Gym equipment route registers only catalog tools.
6. Read tool executes without confirmation.
7. Mutation pauses on the application confirmation modal.
8. Decline causes zero writes.
9. Confirm causes exactly one write.
10. Search tool updates the existing catalog UI.
11. Session tool updates the existing session canvas.
12. Context code redeems once and replay fails.
13. Grant revocation is enforced without clinician reload.
14. Demo reset restores the canonical journey.
15. Tool output never exceeds the configured character budget.

### CI release gate

The release branch must pass:

```bash
pnpm check
pnpm e2e
```

Then run the production URLs manually in:

- Clean Chrome with WebMCP enabled.
- ChatGPT's in-app browser.
- A clean incognito session without a Vercel account or `_vercel_share` parameter.

---

## Patch 9 — Publish real eval evidence

### New file

- `docs/EVAL_RESULTS.md`

### Updated files

- `docs/EVALS.md`
- `README.md`

### Evidence model

Keep deterministic layers separate from probabilistic layers:

1. Schema/fixture validation in CI.
2. Unit tests for handlers and authorization.
3. Browser integration tests with the model-context shim.
4. Manual Chrome WebMCP-panel execution.
5. Repeated agent prompt trials in the actual demo environment.

Record at least:

- Browser and version.
- WebMCP implementation.
- Model/environment used.
- Date.
- Prompt variant.
- Tool-selection result.
- Argument validity.
- Ordered-chain result.
- Visible UI outcome.
- Prohibited disclosure count.

The README should report measured results, not imply that the JSON fixtures themselves are completed agent evaluations.

### Acceptance criteria

- Every published percentage has a recorded denominator.
- Deterministic security assertions pass completely.
- No prohibited disclosure is accepted as a model-quality tradeoff.
- The primary Passport-to-Gym prompt succeeds repeatedly in the exact environment shown in the final video.

---

## Patch 10 — Final demo and submission package

### Update `docs/DEMO_SCRIPT.md`

Target approximately 2:50:

| Time      | Scene                                                                          |
| --------- | ------------------------------------------------------------------------------ |
| 0:00–0:12 | Problem: agents either guess from pages or receive too much context            |
| 0:12–0:27 | Thesis: purpose-bound context with permission                                  |
| 0:27–0:50 | Owner asks agent to prepare a twenty-minute Gym share; show exact confirmation |
| 0:50–1:10 | One-use handoff; show what Gym received and explicitly did not receive         |
| 1:10–1:40 | Agent searches verified equipment; existing cards visibly update               |
| 1:40–2:10 | Agent selects a published walkthrough; existing session canvas updates         |
| 2:10–2:30 | Show template/catalog provenance, decision trace, and manufacturer sources     |
| 2:30–2:42 | Open existing WebMCP inspector and show actual executions                      |
| 2:42–2:50 | Close: user remained in control; full Passport was never transferred           |

The clinician workspace may appear in screenshots or README, but it should not consume the primary video path unless the Passport-to-Gym sequence is already comfortably under the limit.

### Submission copy principle

Do not say “WebMCP transfers the Passport.” Use:

> WebMCP exposes purpose-appropriate tools inside each website. Adaptive World's one-use consent protocol carries the minimal projection between Passport and Gym.

### Manual ship checks

- Production aliases work without Vercel deployment protection.
- Demo credentials work from a clean browser.
- The canonical reset works.
- The final video depicts the exact deployed commit.
- The public repository, license, production URLs, credentials, and video are all present in the submission.

---

## 5. Commit strategy

Use small commits that can be reverted independently:

1. `docs: satisfy hackathon submission requirements`
2. `fix: make WebMCP reads server-authoritative`
3. `fix: align Gym context grant expiry contract`
4. `refactor: remove simulated patient changes tool`
5. `feat: add authenticated synthetic demo reset`
6. `feat: synchronize Gym WebMCP actions with existing UI`
7. `test: cover WebMCP registration and critical journeys`
8. `docs: publish eval results and final demo path`

Do not combine the Neon runtime-role experiment with the core submission branch unless it is completed and verified before code freeze.

---

## 6. RLS decision gate

The deployed database currently relies on application authorization because the available login roles bypass RLS. The repository's policy migration is useful design evidence, but it is not an active runtime boundary under that role.

### Minimum required patch

Correct the documentation and ensure every WebMCP handler performs fresh server authorization.

### Optional hardening patch

Only proceed when all of the following can be completed together:

- Provision a non-owner, non-`BYPASSRLS` runtime role.
- Grant only required schema/table/function privileges.
- Use the runtime role in both Vercel projects.
- Set request identity inside the same transaction as protected queries.
- Verify owner, doctor, Gym, redemption, reset, and migration paths.
- Keep migrations on a separate owner/direct connection.
- Run the complete regression suite against a preview Neon branch.

If any part is incomplete, do not ship partial RLS activation. Accurate application-level authorization is safer than an unstable last-minute database-role change.

---

## 7. Explicit non-goals before submission

- No OpenAI API chatbot inside the product.
- No remote MCP server added just for breadth.
- No payment surface beyond the single Routine Pro sandbox entitlement defined
  by the integrated plan.
- No additional medical recommendation logic.
- No diagnosis, treatment, clearance, or emergency behavior.
- No new authentication provider.
- No new database abstraction.
- No catalog expansion.
- No UI redesign.
- No mobile app.
- No additional WebMCP tools unless they replace a weaker tool and improve the primary demo.

---

## 8. Final release gate

Do not submit until all items are true:

- [ ] GitHub detects the root license.
- [ ] Both production URLs work in incognito without a Vercel bypass URL.
- [ ] Owner and doctor credentials work.
- [ ] The synthetic demo reset restores canonical state.
- [ ] Passport and doctor reads reauthorize on every invocation.
- [ ] Revocation is effective without reload.
- [ ] Tool-reported context expiry equals persisted expiry.
- [ ] The simulated clinician-delta tool is removed from code, docs, schemas, and eval fixtures.
- [ ] Agent catalog search updates the existing catalog UI.
- [ ] Agent session creation updates the existing session canvas.
- [ ] Mutations require visible confirmation and execute exactly once.
- [ ] Replay, expiry, scope, and BOLA tests pass.
- [ ] Fixture validation is not mislabeled as completed model evals.
- [ ] Actual eval results are recorded.
- [ ] `pnpm check` passes.
- [ ] `pnpm e2e` passes.
- [ ] Chrome WebMCP manual execution passes.
- [ ] ChatGPT in-app browser critical journey passes.
- [ ] README contains the 60-second judge path.
- [ ] Final video is public, audible, and below three minutes.
- [ ] Final video and production deployments use the same Git SHA.

## 9. Definition of success

The patched MVP should feel almost identical to the current product when used by a human alone. The improvement should become obvious only when an agent participates:

- The available tools are correct for the current page and role.
- Authorization is current rather than cached in the browser.
- The person visibly approves consequential actions.
- The agent changes the existing product UI instead of producing a disconnected text response.
- The cross-site handoff reveals only the approved projection.
- Any judge can restore and replay the canonical demo.
- Every public claim is supported by deployed behavior or clearly labeled as future hardening.

That is the highest-value path to a winning submission without adding UI/UX noise.
