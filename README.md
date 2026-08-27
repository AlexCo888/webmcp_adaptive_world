# Adaptive World

Adaptive World is a WebMCP-native hackathon MVP that demonstrates how a person can carry private context between real-world services without handing every service their complete identity or medical history.

The repository contains two independently deployable Next.js applications:

- **Digital Passport** — a patient/clinician portal for synthetic health records, permissions, audit history, and purpose-bound context grants.
- **Adaptive Gym** — a 68-item equipment catalog that consumes only a minimum Gym projection, creates catalog-grounded sessions, and records confirmed feedback.

All people, records, laboratories, documents, and clinical scenarios in this repository are synthetic. Nothing here is medical advice or a production clinical system.

## Why this demo matters

Most personalization systems copy a complete profile into every destination. Adaptive World uses progressive disclosure instead:

1. The person chooses a purpose and recipient.
2. Passport derives a narrow, expiring projection.
3. A 256-bit opaque exchange token is stored only as a SHA-256 hash.
4. Adaptive Gym redeems the token once and receives no identity, labs, medications, or source documents.
5. Every sensitive read and mutation remains scope-bound and auditable.

## WebMCP tools

The visible applications remain fully usable when WebMCP is unavailable. When Chrome exposes `document.modelContext`, each route registers only the tools appropriate to its current role.

| Surface        | Tools | Examples                                          |
| -------------- | ----: | ------------------------------------------------- |
| Passport owner |     4 | `get_my_passport_summary`, `create_context_grant` |
| Doctor portal  |     6 | `search_my_patients`, `get_patient_section`       |
| Adaptive Gym   |     6 | `search_equipment`, `create_session_draft`        |

Read-only and untrusted-content annotations, route-scoped lifecycle cleanup, 1,500-character output limits, and application-owned confirmation dialogs are implemented in `packages/webmcp`.

## Repository structure

```text
apps/
  passport/       Patient and clinician experience
  gym/            Equipment, context, sessions, feedback
packages/
  contracts/      Shared Zod and TypeScript contracts
  demo-data/      Six synthetic Passports and 68 equipment records
  security/       Grants, scope authorization, redaction, audit helpers
  db/             Neon/Drizzle schema, migrations, RLS, atomic redemption
  webmcp/         Browser API adapter, tool catalogs, lifecycle and tests
  ui/             Shared UI primitives
docs/             Architecture, security, evals, deployment and demo script
tests/            WebMCP eval fixtures and two-site browser smoke tests
```

## Run locally

Requirements: Node.js 20.19+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

- Passport: `http://localhost:3000`
- Gym: `http://localhost:3001`

For local WebMCP testing, enable `chrome://flags/#enable-webmcp-testing`, relaunch Chrome, and open each site directly. Both applications include a live tool inspector that reports **Active** only when registration actually succeeds.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
node tests/evals/validate.mjs
pnpm build
pnpm e2e
```

The deterministic suite asserts six Passports, exactly 68 unique equipment records, no restricted clinical fields in Gym projections, one-time grant redemption, scope enforcement, WebMCP lifecycle behavior, output limiting, schema integrity, and catalog-grounded session generation.

## Deploy on Vercel

Connect this repository to two Vercel projects:

| Project                 | Root directory  |
| ----------------------- | --------------- |
| Adaptive World Passport | `apps/passport` |
| Adaptive Gym            | `apps/gym`      |

Production deployment additionally requires Neon Postgres and the environment contract in [docs/ENVIRONMENT_VARIABLES.md](docs/ENVIRONMENT_VARIABLES.md). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the complete checklist.

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Threat model](docs/THREAT_MODEL.md)
- [WebMCP tool catalog](docs/WEBMCP_TOOLS.md)
- [Evaluation plan](docs/EVALS.md)
- [Hackathon demo script](docs/DEMO_SCRIPT.md)
- [Official sources](docs/SOURCES.md)
