# Third-party notices

Adaptive World is released under the [MIT License](./LICENSE). That license
applies to the project's original code, documentation, and artwork. It does not
grant rights to third-party trademarks, linked source pages, or other materials
identified below.

## Software

The application uses open-source packages distributed under their respective
licenses. Representative direct dependencies are listed below; the exact
resolved dependency graph and versions are recorded in `pnpm-lock.yaml`.

| Component                   | Project                                                                                  | License    |
| --------------------------- | ---------------------------------------------------------------------------------------- | ---------- |
| Stripe Node.js SDK          | [stripe-node](https://github.com/stripe/stripe-node)                                     | MIT        |
| MPP TypeScript SDK (`mppx`) | [mppx](https://www.npmjs.com/package/mppx)                                               | MIT        |
| viem                        | [viem](https://github.com/wevm/viem)                                                     | MIT        |
| node-postgres (`pg`)        | [node-postgres](https://github.com/brianc/node-postgres)                                 | MIT        |
| Next.js and React           | [Next.js](https://github.com/vercel/next.js), [React](https://github.com/facebook/react) | MIT        |
| Better Auth                 | [Better Auth](https://github.com/better-auth/better-auth)                                | MIT        |
| Drizzle ORM                 | [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm)                               | Apache-2.0 |
| Neon serverless driver      | [Neon serverless](https://github.com/neondatabase/serverless)                            | MIT        |
| Zod                         | [Zod](https://github.com/colinhacks/zod)                                                 | MIT        |
| Lucide                      | [Lucide](https://github.com/lucide-icons/lucide)                                         | ISC        |
| Playwright                  | [Playwright](https://github.com/microsoft/playwright)                                    | Apache-2.0 |
| Vitest                      | [Vitest](https://github.com/vitest-dev/vitest)                                           | MIT        |
| TypeScript                  | [TypeScript](https://github.com/microsoft/TypeScript)                                    | Apache-2.0 |
| ESLint                      | [ESLint](https://github.com/eslint/eslint)                                               | MIT        |
| Prettier                    | [Prettier](https://github.com/prettier/prettier)                                         | MIT        |
| Turborepo                   | [Turborepo](https://github.com/vercel/turborepo)                                         | MIT        |

Nothing in this notice changes an upstream license. Consult each installed
package's license file for its controlling terms.

### Direct runtime SDK notices

The pinned Stripe, `mppx`, `viem`, and `pg` packages each include the MIT
License. Its redistribution condition is to retain the applicable copyright
and permission notice in copies or substantial portions of the software. The
installed files below contain the complete controlling license text; the
copyright lines are reproduced here so this notice remains useful without
implying ownership by Adaptive World.

| Package         | Copyright notice from the installed package                          | Installed license file                 |
| --------------- | -------------------------------------------------------------------- | -------------------------------------- |
| `stripe` 22.6.0 | Copyright (C) 2011 Ask Bjørn Hansen; Copyright (C) 2013 Stripe, Inc. | `apps/gym/node_modules/stripe/LICENSE` |
| `mppx` 0.9.1    | Copyright (c) 2026-present weth, LLC                                 | `apps/gym/node_modules/mppx/LICENSE`   |
| `viem` 2.56.0   | Copyright (c) 2023-present weth, LLC                                 | `apps/gym/node_modules/viem/LICENSE`   |
| `pg` 8.16.3     | Copyright (c) 2010 - 2021 Brian Carlson                              | `apps/gym/node_modules/pg/LICENSE`     |

The installed license files also contain the MIT warranty disclaimer. This
summary is not a substitute for those files and does not add obligations beyond
their terms.

## Product names and source citations

The demo catalog references real product models from Life Fitness, SCIFIT,
Rogue Fitness, and Eleiko. Product names and trademarks belong to their
respective owners. Each record retains a direct manufacturer product-page URL
in `packages/demo-data/src/equipment.ts`; those links support the catalog's
specification provenance and are summarized in
[`docs/SOURCES.md`](./docs/SOURCES.md). Their inclusion does not imply
manufacturer sponsorship, authorization, ownership, or endorsement.

No manufacturer product photography is shipped or rendered. Every equipment
image is a logo-free, neutral illustration created for this project. It is not
an exact manufacturer product depiction.

## Original project artwork

The following original SVG artwork is part of Adaptive World and is covered by
the root MIT License:

- Gym hero: `apps/gym/public/images/adaptive-gym-floor.svg`
- Equipment set: `apps/gym/public/images/equipment/adjustable-bench.svg`,
  `back-extension.svg`, `chest-press.svg`, `dual-pulley.svg`, `elliptical.svg`,
  `fly-rear-delt.svg`, `half-rack.svg`, `recumbent-bike.svg`, `rower.svg`,
  `seated-row.svg`, `total-body-ergometer.svg`, and `treadmill.svg`
- App icons: `apps/gym/app/icon.svg` and `apps/passport/app/icon.svg`

These assets use project-created geometric shapes and the Adaptive World color
palette. They contain no embedded fonts, logos, external image references, or
third-party photographic material.

## No affiliation

Adaptive World, Adaptive Gym, and the synthetic people, facility, inventory,
availability, visits, health records, payments, and agent wallet are demo
constructs. Stripe, MPP, Tempo, OpenAI, ChatGPT, the equipment manufacturers,
and other named services have not endorsed this project unless a separate,
explicit statement from that party says otherwise.
