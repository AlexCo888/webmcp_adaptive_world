# Local setup

## Prerequisites

- Node.js 20.19 or newer
- pnpm 11.19 or compatible 11.x
- Vercel CLI (for linking and pulling project-scoped variables)
- A Neon development branch or another disposable PostgreSQL database
- Chrome with WebMCP support enabled when testing agent tools

## Install and run

```bash
git clone https://github.com/AlexCo888/webmcp_adaptive_world.git
cd webmcp_adaptive_world
corepack enable
pnpm install
pnpm dev
```

To keep ports deterministic during a demo, use two terminals:

```bash
pnpm --filter @adaptive-world/passport dev
pnpm --filter @adaptive-world/gym dev
```

Expected local origins:

- Passport: `http://localhost:3000`
- Gym: `http://localhost:3001`

## Link both Vercel projects

Each app is a separate Vercel project and therefore gets its own `.vercel/project.json` and `.env.local` inside its app directory.

```bash
vercel link --cwd apps/passport --project adaptive-world-passport
vercel env pull apps/passport/.env.local --cwd apps/passport --environment development --yes

vercel link --cwd apps/gym --project adaptive-world-gym
vercel env pull apps/gym/.env.local --cwd apps/gym --environment development --yes
```

Do not create one root `.env.local` that mixes both projects. Re-pull after changing Vercel variables. Local OIDC credentials, when used, are short-lived and may need to be pulled again.

## Database setup

Use a pooled Neon URL for application requests and a direct URL for migration tooling:

```text
DATABASE_URL=postgresql://...-pooler.../adaptive_world
DATABASE_URL_DIRECT=postgresql://.../adaptive_world
```

Run the versioned migration and guarded, idempotent synthetic seed:

```bash
pnpm --filter @adaptive-world/db migrate
CONFIRM_SYNTHETIC_DEMO_SEED=true pnpm --filter @adaptive-world/db seed:demo
```

The seed creates two Better Auth accounts, six synthetic Passports, two exact doctor relationships, one sample guidance record, and 12 source-backed product models. Verify the target database before setting the confirmation flag.

## WebMCP local testing

WebMCP is experimental. Follow the current browser instructions before testing:

1. Open `chrome://flags/#enable-webmcp-testing`.
2. Enable WebMCP testing and relaunch Chrome.
3. Visit the app directly; clients discover tools only from the visited page.
4. Inspect the registered tools in Chrome DevTools under **Application → WebMCP**.
5. Verify that tools change when route, role, or selected patient changes.

Never fall back to DOM scraping when validating WebMCP. Validate the actual tool registry and execute only synthetic demo actions.

## Quality gates

```bash
node tests/evals/validate.mjs
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Optional browser smoke tests:

```bash
pnpm exec playwright install chromium
pnpm exec playwright test
```

The Playwright suite is UI smoke coverage. WebMCP agent behavior is assessed with the fixtures in `tests/evals/` and manual registry inspection.
