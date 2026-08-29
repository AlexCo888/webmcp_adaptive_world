# Local setup

## Prerequisites

- Node.js 20.19 or newer
- pnpm 11.x
- a disposable Neon branch or PostgreSQL database for authenticated/stateful journeys
- a Chrome build supported by the current official WebMCP testing instructions
  for native manual execution
- Vercel CLI only when linking or pulling project-scoped variables

Stripe and MPP are optional locally. Keep their feature flags false unless using
dedicated test-mode/testnet credentials and synthetic data.

## Install and run

```bash
git clone https://github.com/AlexCo888/webmcp_adaptive_world.git
cd webmcp_adaptive_world
corepack enable
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
```

Create separate environment files in `apps/passport/.env.local` and
`apps/gym/.env.local`; do not create one root file mixing both projects. Follow
[`ENVIRONMENT_VARIABLES.md`](./ENVIRONMENT_VARIABLES.md).

Both files require an `ADAPTIVE_WORLD_DEMO_SECRET`, but the values must be
independently generated. The Passport value signs the short-lived WebMCP
projection-preparation token; the Gym value signs its anonymous HttpOnly
session. Reusing one value across the two files collapses those trust domains.
There are no app-level `.env.example` files to copy: use the authoritative
project tables in `ENVIRONMENT_VARIABLES.md`; `packages/db/.env.example` is
only for database tooling.

The database package does not load either app's `.env.local`. Export the exact
verified database URL explicitly for migration and seed commands. Prefer a
direct connection for the one-off migration when the provider recommends it:

```bash
export ADAPTIVE_WORLD_DB_TOOL_URL='postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=require'
DATABASE_URL="$ADAPTIVE_WORLD_DB_TOOL_URL" pnpm --filter @adaptive-world/db migrate
DATABASE_URL="$ADAPTIVE_WORLD_DB_TOOL_URL" CONFIRM_SYNTHETIC_DEMO_SEED=true pnpm --filter @adaptive-world/db seed:demo
unset ADAPTIVE_WORLD_DB_TOOL_URL
```

Run the seed only against a verified disposable database containing synthetic
demo data. `SEED_DEMO` does not run this script; it only controls development
self-sign-up.

Run both applications:

```bash
pnpm dev
```

For deterministic ports, use separate terminals:

```bash
pnpm --filter @adaptive-world/passport dev
pnpm --filter @adaptive-world/gym dev
```

Expected origins are Passport `http://127.0.0.1:3000` and Gym
`http://127.0.0.1:3001`.

## Optional Vercel linking

```bash
vercel link --cwd apps/passport --project adaptive-world-passport
vercel env pull .env.local --cwd apps/passport --environment development --yes

vercel link --cwd apps/gym --project adaptive-world-gym
vercel env pull .env.local --cwd apps/gym --environment development --yes
```

Re-pull after changing variables. Never copy provider/wallet secrets between
Preview and Production.

## WebMCP testing

Follow the current
[official Chrome WebMCP instructions](https://developer.chrome.com/docs/ai/webmcp)
on the day of the run. As documented on 2026-08-07, local testing requires
opening `chrome://flags/#enable-webmcp-testing`, setting the flag to **Enabled**,
and relaunching Chrome. The API is experimental, so verify that instruction
against the linked source rather than copying an older flag name.

Visit each application directly and confirm that `document.modelContext`
exists. Inspect the registered tools with the currently documented Chrome
inspector/DevTools workflow and confirm that they change with route,
authenticated role, and state. Record the exact Chrome channel/version,
WebMCP configuration, official-instructions date, and observed registry in
[`EVAL_RESULTS.md`](./EVAL_RESULTS.md).

The ordinary UI must remain complete without WebMCP. Never substitute DOM
scraping for a claimed WebMCP run.

## Deterministic gates

```bash
pnpm check
pnpm e2e
```

`pnpm check` covers formatting, linting, type checking, unit tests, structural
eval-fixture validation, and production builds. `pnpm e2e` starts the local apps
and runs public browser smoke plus the deterministic `document.modelContext`
shim suite.

The shim records tool registration, execution, output/error, and
unregistration. It proves integration mechanics only; it is neither native
Chrome WebMCP nor a model-selection run.

Run only the shim spec with:

```bash
pnpm e2e:shim
```

## Live and provider evidence

Authenticated revocation/reset, native Chrome WebMCP, ChatGPT in-app browser,
Stripe test Checkout/webhook, and MPP testnet journeys require an isolated
deployed environment or explicitly configured synthetic test database. They
are release checks, not silently skipped claims in normal PR CI.

Record each completed run in [`EVAL_RESULTS.md`](./EVAL_RESULTS.md) with the
exact Git SHA, environment, denominators, and redacted artifact. Do not call a
mocked Playwright provider response a real provider smoke.
