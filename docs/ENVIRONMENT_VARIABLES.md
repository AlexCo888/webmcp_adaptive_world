# Environment variables

This is the runtime contract implemented by the current code. Missing server secrets fail closed; no secret may use a `NEXT_PUBLIC_` prefix.

## Passport Vercel project

| Variable                   | Required | Exposure     | Purpose                                                         |
| -------------------------- | -------- | ------------ | --------------------------------------------------------------- |
| `DATABASE_URL`             | Yes      | Server only  | Neon pooled connection used by Better Auth and application data |
| `BETTER_AUTH_SECRET`       | Yes      | Server only  | High-entropy Better Auth signing secret, at least 32 characters |
| `BETTER_AUTH_URL`          | Yes      | Server only  | Exact canonical Passport origin                                 |
| `NEXT_PUBLIC_PASSPORT_URL` | Yes      | Browser-safe | Canonical Passport origin used in metadata and links            |
| `NEXT_PUBLIC_GYM_URL`      | Yes      | Browser-safe | Exact Gym origin used for the approved handoff                  |
| `SEED_DEMO`                | No       | Server only  | Keep unset/false in deployed apps; sign-up remains disabled     |

## Gym Vercel project

| Variable                     | Required | Exposure     | Purpose                                                                     |
| ---------------------------- | -------- | ------------ | --------------------------------------------------------------------------- |
| `DATABASE_URL`               | Yes      | Server only  | Neon pooled connection for one-use grants, anonymous sessions, and feedback |
| `ADAPTIVE_WORLD_DEMO_SECRET` | Yes      | Server only  | High-entropy HMAC key for the Gym's HttpOnly session token                  |
| `NEXT_PUBLIC_GYM_URL`        | Yes      | Browser-safe | Canonical Gym origin                                                        |
| `NEXT_PUBLIC_PASSPORT_URL`   | Yes      | Browser-safe | Canonical Passport origin for the connect flow                              |

The current opaque context grant does not require a shared pepper: the code is 256 random bits and only its lowercase SHA-256 digest is stored. Passport and Gym coordinate through Neon and do not share a browser cookie.

## Migration and seed only

| Variable                           | Purpose                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------- |
| `DATABASE_URL`                     | Migration/seed target; use a direct URL for one-off tooling when appropriate |
| `CONFIRM_SYNTHETIC_DEMO_SEED=true` | Explicit guard required by the versioned demo seed                           |
| `DEMO_ACCOUNT_PASSWORD`            | Optional override for the two synthetic Better Auth accounts                 |

The public fallback demo password is acceptable only because every identity and record is synthetic. Use a unique value in any non-public environment.

## Production values

| Variable          | Passport value                      | Gym value                               |
| ----------------- | ----------------------------------- | --------------------------------------- |
| Canonical origin  | `https://passport-eosin.vercel.app` | `https://gym-alpha-amber-89.vercel.app` |
| Paired public URL | Gym origin                          | Passport origin                         |

## Rules

- Mark `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `ADAPTIVE_WORLD_DEMO_SECRET` sensitive in Vercel.
- Use separate secrets per environment. Preview should use an isolated Neon branch whenever it permits mutations.
- Do not put tokens, database URLs, clinical values, or identifiers in browser-visible environment variables.
- Redeploy after changing a Vercel variable; existing deployments do not receive the new value.
- Never log environment values or include them in GitHub Actions artifacts.
- The checked-in CI build fallbacks are unreachable application endpoints used only so static production compilation can run without production credentials.
