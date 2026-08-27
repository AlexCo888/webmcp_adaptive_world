# Environment variables

This document is the deployment contract. Exact validation lives in server code; missing secrets must fail closed.

## Shared server-only values

| Variable               | Passport       | Gym                                       | Purpose                                                              |
| ---------------------- | -------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| `DATABASE_URL`         | Required       | Required                                  | Neon pooled application connection                                   |
| `DATABASE_URL_DIRECT`  | Migration only | Migration only                            | Direct connection for migrations; never browser-exposed              |
| `AUTH_SECRET`          | Required       | Required if sessions are verified locally | High-entropy authentication secret                                   |
| `CONTEXT_GRANT_PEPPER` | Required       | Required                                  | Keyed digest for one-time context codes; same value on both projects |
| `AUDIT_HMAC_KEY`       | Required       | Required                                  | Integrity/pseudonymization for sensitive audit metadata              |
| `DEMO_MODE`            | Required       | Required                                  | Must be `true` for public hackathon demos                            |

## Passport project

| Variable                   | Exposure            | Purpose                                              |
| -------------------------- | ------------------- | ---------------------------------------------------- |
| `NEXT_PUBLIC_PASSPORT_URL` | Browser-safe        | Canonical Passport origin only                       |
| `GYM_ORIGIN`               | Server-only         | Exact allowed Gym origin for redirects and exchanges |
| `BLOB_READ_WRITE_TOKEN`    | Server-only         | Private Vercel Blob access for synthetic documents   |
| `WEBMCP_ENABLED`           | Server/build config | Feature gate; keep standard UI functional when false |

## Gym project

| Variable              | Exposure            | Purpose                                               |
| --------------------- | ------------------- | ----------------------------------------------------- |
| `NEXT_PUBLIC_GYM_URL` | Browser-safe        | Canonical Gym origin only                             |
| `PASSPORT_ORIGIN`     | Server-only         | Exact Passport origin for server-to-server redemption |
| `WEBMCP_ENABLED`      | Server/build config | Feature gate                                          |

## Rules

- Never put tokens, database URLs, health data, identifiers, or cryptographic keys in variables prefixed `NEXT_PUBLIC_`.
- Scope Preview variables to disposable data. Preview deployments must not access the production database or Blob store.
- Mark secrets sensitive in Vercel. Do not copy them into GitHub Actions unless the workflow truly requires them.
- Use separate authentication and grant keys per environment.
- Rotate `CONTEXT_GRANT_PEPPER` only with an invalidation plan for outstanding grants.
- Values changed in Vercel apply to new deployments; redeploy after a rotation.
- Do not log values during startup validation.

## Suggested origin values

| Environment | Passport                            | Gym                                 |
| ----------- | ----------------------------------- | ----------------------------------- |
| Development | `http://localhost:3000`             | `http://localhost:3001`             |
| Preview     | Project-specific Vercel preview URL | Project-specific Vercel preview URL |
| Production  | Final Passport domain               | Final Gym domain                    |

Use an exact allowlist. Wildcard preview origins should be avoided for any cross-origin exchange; instead derive paired preview URLs through controlled deployment metadata or disable exchanges in arbitrary previews.
