# Adaptive World

Adaptive World is a two-site, WebMCP-native MVP showing how a person can carry purpose-bound context into a real service without handing that service a complete identity or medical record.

- **Digital Passport** gives a person one private Passport, consent controls, an append-only access log, and a one-use Gym handoff.
- **Doctor workspace** is a separate authenticated experience. A clinician can search only active relationships and can open only sections covered by current scopes.
- **Adaptive Gym** behaves like a public club site. It presents 12 real commercial product models with manufacturer sources and images, then matches connected context to one of three versioned, staff-authored walkthroughs.

All people, clinical records, club ownership, availability, and visits are synthetic. The product models and cited manufacturer pages are real. This is a hackathon demo, not a clinical system or medical advice.

## Try the professional demo

Passport: [passport-eosin.vercel.app](https://passport-eosin.vercel.app)

Gym: [gym-alpha-amber-89.vercel.app](https://gym-alpha-amber-89.vercel.app)

| Workspace         | Email                             | Password             | What it proves                                                        |
| ----------------- | --------------------------------- | -------------------- | --------------------------------------------------------------------- |
| Passport owner    | `mateo.demo@adaptiveworld.test`   | `AdaptiveWorld2026!` | One owner, one private Passport, explicit sharing                     |
| Authorized doctor | `elena.vargas@adaptiveworld.test` | `AdaptiveWorld2026!` | Separate role, only two granted patients, scope-gated sections        |
| Gym visitor       | No account required               | —                    | Public catalog; anonymous session only after one-use Passport handoff |

Self-registration is disabled. Better Auth verifies the password, creates the server-side session, and issues an HttpOnly cookie. Application roles come from Neon—not from a client-side selector or cookie claim.

## What is real versus synthetic

| Element                                                                       | Status                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Better Auth password/session flow                                             | Real                                                                     |
| Neon persistence, relationships, grants, audit events, Gym sessions, feedback | Real                                                                     |
| One-use 256-bit context token, SHA-256-at-rest, atomic redemption             | Real                                                                     |
| WebMCP registration and handler execution                                     | Real when the browser exposes `document.modelContext`                    |
| Life Fitness, SCIFIT, Rogue, and Eleiko product models/sources/images         | Real and source-linked                                                   |
| Patient identities and clinical records                                       | Synthetic                                                                |
| Adaptive Gym address, hours, ownership, inventory, and availability           | Synthetic demo scenario                                                  |
| Walkthrough content                                                           | Fixed, versioned, staff-authored demo content—not AI-generated treatment |

## Core flow

1. Mateo signs in and reviews the exact Gym projection.
2. Passport stores a random one-use code only as a SHA-256 hash; the plaintext appears once in the URL fragment.
3. Gym atomically redeems the code and creates an anonymous, persisted Gym session.
4. Gym receives goals, movement considerations, access needs, stop signals, and expiry—never identity, medications, labs, documents, Passport ID, or clinician identity.
5. Site UI or WebMCP selects a published walkthrough. The server reads context from the HttpOnly session, verifies every station against the current catalog, persists the plan, and returns template/catalog provenance.
6. Feedback is written against that exact anonymous session.

## WebMCP implementation

The normal UI is complete without WebMCP. When supported, each visible route registers only its relevant imperative tools through `document.modelContext.registerTool`.

| Surface          | Tools | Important behavior                                                           |
| ---------------- | ----: | ---------------------------------------------------------------------------- |
| Passport owner   |     4 | Summary, shares, one-use context grant, revocation                           |
| Doctor workspace |     6 | My Patients search, progressive sections, source opening, confirmed guidance |
| Adaptive Gym     |     6 | Real catalog search, active context, published template selection, feedback  |

Every handler calls the same protected server APIs as the visible UI. Mutations use an application-owned confirmation dialog; results are capped at 1,500 characters; untrusted source/product content is annotated; handler executions appear in the in-product trace.

## Architecture

```text
apps/
  passport/       Better Auth, owner workspace, doctor workspace, grants and audit
  gym/            Public club, verified products, anonymous context/session flow
packages/
  contracts/      Shared Zod and TypeScript contracts
  db/             Neon/Drizzle schema, migrations, atomic redemption, demo seed
  demo-data/      Six synthetic Passports and 12 source-backed product records
  security/       Projection minimization, opaque grants, signed Gym cookie
  webmcp/         Browser adapter, route tool catalogs, confirmation and tests
  ui/             Shared primitives
docs/             Architecture, threat model, deployment, evals and demo script
tests/            17 WebMCP eval fixtures and two-site Playwright smoke tests
```

The monorepo deploys as two Vercel projects with root directories `apps/passport` and `apps/gym`. They do not share browser cookies. Neon is the common persistence boundary; authorization is repeated on every request.

## Local setup

Requirements: Node.js 20.19+, pnpm 11+, and a disposable PostgreSQL/Neon database.

```bash
pnpm install
pnpm --filter @adaptive-world/db migrate
CONFIRM_SYNTHETIC_DEMO_SEED=true pnpm --filter @adaptive-world/db seed:demo
pnpm dev
```

Add the variables documented in [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md) to each app's `.env.local`. Local origins are Passport `http://127.0.0.1:3000` and Gym `http://127.0.0.1:3001`.

## Verification

```bash
pnpm check
pnpm e2e
```

The suite validates six Passports, 12 unique source-backed products, minimum disclosure, one-use redemption primitives, route-scoped WebMCP catalogs, human confirmation, schema integrity, 17 WebMCP selection/authorization/provenance fixtures, production builds, and public browser flows.

See [Architecture](docs/ARCHITECTURE.md), [Threat model](docs/THREAT_MODEL.md), [WebMCP tools](docs/WEBMCP_TOOLS.md), [Evals](docs/EVALS.md), [Demo script](docs/DEMO_SCRIPT.md), and [Deployment](docs/DEPLOYMENT.md).
