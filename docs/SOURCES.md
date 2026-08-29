# Official sources and design traceability

Checked 2026-08-29. WebMCP, Stripe, MPP, and testnet behavior can change;
re-check primary sources and pinned SDK versions before submission or any
production use.

## WebMCP

- [Chrome: WebMCP overview](https://developer.chrome.com/docs/ai/webmcp) — proposed standard, progressive enhancement, local human-in-the-loop focus, origin isolation, permissions policy, and current local-testing instructions.
- [Chrome: Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api) — `document.modelContext.registerTool`, schema-based tool definition, dynamic tools.
- [Chrome: Declarative API](https://developer.chrome.com/docs/ai/webmcp/declarative-api) — annotated HTML forms as tools.
- [Chrome: WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices) — clear non-overlapping tools, route/state registration, schema and testing guidance.
- [Chrome: WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools) — prompt-injection risk, `readOnlyHint`, `untrustedContentHint`, careful `exposedTo`, and current character-budget guidance.
- [Chrome: WebMCP evals](https://developer.chrome.com/docs/ai/webmcp/evals) — tool selection, arguments, call order, deterministic tests, probabilistic evals, and end-to-end journeys.
- [Chrome DevTools: WebMCP panel](https://developer.chrome.com/docs/devtools/application/webmcp) — inspect registered tools, schemas, execution, result, and error state.
- [Web Machine Learning Community Group: WebMCP repository](https://github.com/webmachinelearning/webmcp) — explainer/spec discussion and issue tracker.
- [GoogleChromeLabs: WebMCP demos](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos) — reference demos, not a security authority.

## Vercel and Turborepo

- [Vercel: Monorepos](https://vercel.com/docs/monorepos) — connect multiple projects to one repository and configure a Root Directory per project.
- [Vercel: Turborepo](https://vercel.com/docs/monorepos/turborepo) — workspace dependency builds and monorepo project configuration.
- [Vercel: Environment variables](https://vercel.com/docs/environment-variables) — Production/Preview/Development scoping and secret configuration.
- [Vercel: Deployments](https://vercel.com/docs/deployments) — Preview, Production, inspect, promote, and rollback lifecycle.
- [Vercel: Storage](https://vercel.com/docs/storage) and [Blob](https://vercel.com/docs/vercel-blob) — public/private object storage; this project requires private storage for synthetic clinical documents.

## Stripe test-mode commerce

- [Stripe: Idempotent requests](https://docs.stripe.com/api/idempotent_requests) — saved response behavior, identical-parameter requirement, and the fact that a pruned key can create a new request after it is at least 24 hours old. Adaptive World therefore persists a conservative replay cutoff and stops unattached create retries at/after it.
- [Stripe: Create a Checkout Session](https://docs.stripe.com/api/checkout/sessions/create) — server-created Checkout contract, line items, metadata, redirects, and provider expiry requirements.
- [Stripe: Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment) — fulfillment must use verified asynchronous events rather than relying on the landing page.
- [Stripe: Webhook signatures](https://docs.stripe.com/webhooks/signature) — raw request-body signature verification.
- [stripe-node](https://github.com/stripe/stripe-node) — pinned server SDK source and license.

Stripe references support a sandbox integration design; they do not make a
browser redirect proof of payment or establish real-money production readiness.

## MPP and testnet agent payer

- [mppx](https://github.com/wevm/mppx) — pinned TypeScript implementation used for the server-held demo-agent and merchant flow.
- [mppx package](https://www.npmjs.com/package/mppx) — published version and package metadata.

The judged flow is a bounded first-party demo wallet on testnet. No standalone
public capability-issuance endpoint, general-purpose wallet, real asset custody,
or ChatGPT/OpenAI wallet is claimed.

## Next.js

- [Next.js: App Router](https://nextjs.org/docs/app) — application and server routing model.
- [Next.js: Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers) — server endpoints using Web Request/Response APIs.
- [Next.js: Authentication](https://nextjs.org/docs/app/guides/authentication) — authentication, session management, and authorization; Route Handlers must be treated as public endpoints and authorized accordingly.
- [Next.js: Environment variables](https://nextjs.org/docs/app/guides/environment-variables) — server-only vs `NEXT_PUBLIC_` bundle exposure.

## Neon/PostgreSQL

- [Neon: Choose a connection](https://neon.com/docs/connect/choose-connection) — use pooled connections by default for concurrent application traffic.
- [Neon: Connection pooling](https://neon.com/docs/connect/connection-pooling) — PgBouncer pooling behavior and connection-string format.
- [Neon: Connect Next.js](https://neon.com/docs/guides/nextjs) — supported Next.js connection patterns.
- [PostgreSQL: Row security policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) — optional defense-in-depth after application authorization is correct and tested.

## Standards used by demo data

- [HL7 FHIR R4: DiagnosticReport](https://hl7.org/fhir/R4/diagnosticreport.html) and [Observation](https://hl7.org/fhir/R4/observation.html) — structural reference only; the demo does not claim conformance certification.
- [LOINC](https://loinc.org/) and [UCUM](https://ucum.org/) — codes and units in synthetic fixtures.

## Equipment and image provenance

The exact Life Fitness, Hammer Strength, SCIFIT, Rogue Fitness, Eleiko, Torque
Fitness, Balanced Body, and NuStep manufacturer product-page URLs remain stored
beside each record in `packages/demo-data/src/equipment.ts`. They support
specification provenance; they do not imply ownership, permission, affiliation,
or endorsement. The Gym renders local, logo-free WebP visualizations created
for Adaptive World—no manufacturer product photography. The root
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md) inventories the original
artwork and applicable third-party notices.

For the Torque Free-Standing F9, the catalog keeps the product page's doors-open
machine footprint separate from the 244 × 274 cm live area in Torque's linked
assembly guide. Constrained-space searches use the live area.

## Non-claims

Official technical sources support implementation choices; they do not establish health-data compliance, clinical validity, or regulatory clearance. Those claims are explicitly outside this MVP.
