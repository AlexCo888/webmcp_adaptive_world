# Deployment and release checklist

Vercel Git integration is the default deployment path. GitHub Actions verifies the repository; Vercel builds each app as a distinct project from the same commit.

## Project configuration

Create two projects by importing `AlexCo888/webmcp_adaptive_world` twice:

| Setting              | Passport project          | Gym project          |
| -------------------- | ------------------------- | -------------------- |
| Project name         | `adaptive-world-passport` | `adaptive-world-gym` |
| Root Directory       | `apps/passport`           | `apps/gym`           |
| Framework preset     | Next.js                   | Next.js              |
| Install/build/output | Auto-detected             | Auto-detected        |
| Production branch    | `main`                    | `main`               |

Keep **Include source files outside of the Root Directory** enabled when the apps import shared workspace packages. Configure each project's variables independently; use Vercel Shared Environment Variables only for deliberately identical secrets such as the development database and context-grant pepper.

## Environments

- **Development:** local origins and a disposable Neon branch.
- **Preview:** isolated Neon branch/data, synthetic-only documents, random secrets, and Preview origins.
- **Production demo:** synthetic dataset only, production domains, private Blob, and `DEMO_MODE=true`.

Preview must never inherit a production `DATABASE_URL` or production Blob token.

## Before first deployment

- [ ] Domains and exact Passport/Gym origin allowlists are known.
- [ ] Environment contract in `ENVIRONMENT_VARIABLES.md` is satisfied for both projects.
- [ ] Neon pooled URL is used for request traffic; direct URL is restricted to migrations.
- [ ] Private Blob store contains synthetic documents only.
- [ ] Authentication callback URLs include the correct environment origins.
- [ ] Origin/permissions headers needed by the targeted WebMCP implementation are verified on Preview.
- [ ] Database migrations are backward compatible with the currently deployed apps.

## Preview gate

- [ ] GitHub `CI` workflow is green.
- [ ] Passport and Gym Preview deployments are both **Ready** for the same commit.
- [ ] `node tests/evals/validate.mjs` reports 16 valid fixtures.
- [ ] Synthetic disclaimer appears on both apps.
- [ ] Owner, clinician, and Gym critical journeys work through the standard UI.
- [ ] Chrome DevTools **Application → WebMCP** shows only route/role-appropriate tools.
- [ ] All write tools show first-party confirmation.
- [ ] Unauthorized patient ID, expired grant, revoked grant, and replay are denied.
- [ ] Gym projection is free of identity, medication, lab, document, and clinician fields.
- [ ] Tool descriptions/results meet the documented character budgets.
- [ ] Browser smoke tests pass against both Preview URLs.

## Production promotion

Prefer validating a Preview artifact and promoting the same artifact rather than rebuilding different code. If using CLI promotion:

```bash
vercel inspect <preview-url>
vercel promote <preview-url>
```

Because there are two Vercel projects, record and promote each deployment generated from the same Git SHA. If a database migration is required, use an expand/contract migration so either app version remains compatible during the non-atomic two-project promotion window.

## Post-deploy verification

- [ ] Both production responses are healthy and reference the intended Git SHA.
- [ ] No server errors appear in Vercel logs during all six demo journeys.
- [ ] Audit events record allow, deny, redeem, replay denial, confirmation, and revoke.
- [ ] No secret, context code, document body, lab value, or free-text guidance appears in logs.
- [ ] WebMCP registry is present only where supported; ordinary UI remains complete elsewhere.
- [ ] Production demo-reset procedure works and preserves synthetic labeling.

## Rollback

1. Stop demo mutations with the feature gate if data integrity is in doubt.
2. Roll back both Vercel projects to the last compatible deployments.
3. Do not roll back a destructive schema migration; deploy a forward repair.
4. Revoke all outstanding one-time context codes if the incident touches auth, grants, cryptography, or logs.
5. Document the affected Git SHAs, deployments, environment, and audit events.

```bash
vercel rollback <deployment-url-or-id>
```

Never print or paste production environment values into an incident ticket.
