# WebMCP tool strategy

WebMCP enhances the visible first-party UI. It does not replace APIs, server authorization, consent, or human confirmation.

## Registration rules

- Register tools only after authentication and role state resolve.
- Register only tools useful on the current page; unregister on navigation or state change.
- Use imperative tools for authenticated, asynchronous, and state-dependent flows.
- Use declarative annotations only for simple, visible, non-sensitive forms.
- Never add `exposedTo` to Passport or clinician tools. Keep Gym tools same-origin for the MVP.
- Keep a fully functional standard UI for browsers without WebMCP.

## Patient Passport

| Tool                      | Type  | Available when               | Result/side effect                                |
| ------------------------- | ----- | ---------------------------- | ------------------------------------------------- |
| `get_my_passport_summary` | Read  | Owner is on own Passport     | Small synthetic profile summary; no source bodies |
| `list_my_shares`          | Read  | Owner views sharing          | Active/revoked shares and scopes                  |
| `create_context_grant`    | Write | Owner reviews Gym projection | Confirmation, one-time exchange code, audit event |
| `revoke_access_grant`     | Write | Owner selects active grant   | Confirmation, revocation, audit event             |

## Clinician portal

| Tool                    | Type           | Available when                       | Result/side effect                                 |
| ----------------------- | -------------- | ------------------------------------ | -------------------------------------------------- |
| `search_my_patients`    | Read           | Authenticated clinician              | Searches only patients with an active relationship |
| `get_patient_overview`  | Read           | Patient selected and overview scoped | Minimal overview plus available section handles    |
| `get_patient_section`   | Read           | Requested section is scoped          | One bounded section, not a full dump               |
| `get_patient_changes`   | Read           | Timeline scope active                | Changes since a valid timestamp                    |
| `open_patient_source`   | Read/untrusted | Source handle is scoped              | One synthetic source or signed, expiring view      |
| `add_clinical_guidance` | Write          | Guidance scope and patient selected  | First-party review, idempotent write, audit event  |

There is intentionally no global `search_patients` tool.

## Adaptive Gym

| Tool                      | Type             | Available when                              | Result/side effect                                     |
| ------------------------- | ---------------- | ------------------------------------------- | ------------------------------------------------------ |
| `get_gym_profile`         | Read             | Public Gym route                            | Services, accessibility, hours/status needed by agent  |
| `search_equipment`        | Read/untrusted   | Catalog route                               | Bounded matches from the real catalog                  |
| `get_equipment`           | Read/untrusted   | Valid catalog item                          | One specification record                               |
| `get_active_context`      | Read             | Context has been redeemed and remains valid | Minimum projection only                                |
| `create_session_draft`    | Write-like draft | Active context and published template ID    | Persisted walkthrough with template/catalog provenance |
| `record_session_feedback` | Write            | Session complete                            | Confirmation and bounded feedback event                |

## Server call sequence

Every tool handler uses the same sequence:

1. Parse input with a strict schema and reject unknown properties.
2. Resolve the server session; never accept actor or role from the tool input.
3. Resolve resource through the actor's authorized relationship set.
4. Re-check scope, grant status, purpose, expiry, and revocation.
5. Execute a bounded query or purpose-specific mutation.
6. Write a redacted audit event.
7. Return the minimum structured result and a stable error code on failure.

## Result envelope

```json
{
  "ok": true,
  "data": {},
  "meta": {
    "requestId": "req_demo",
    "asOf": "2026-08-26T00:00:00Z",
    "synthetic": true
  }
}
```

Errors use `ok: false`, a stable `error.code`, and a human-readable message that does not reveal unauthorized resource existence. Tool results avoid HTML and source instructions.

## Confirmation contract

Mutating WebMCP calls prepare an action and bring the first-party UI to a review state. The user sees target, fields, purpose, expiry, and effect. Execution occurs only after an explicit click/tap in that UI. Cancel returns `CANCELLED` without mutation. The server rechecks the active relationship or session immediately before the write and records the exact persisted resource.

## Character budgets

Chrome's current security guidance recommends these working limits:

- tool name and parameter name: 30 characters
- tool description: 500 characters
- parameter description: 150 characters
- individual tool output: 1,500 characters

These are QA budgets rather than assumptions that the browser enforces them.
