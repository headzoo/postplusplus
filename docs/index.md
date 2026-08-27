# Post++ Internal Docs

These docs are for maintainers working inside the Post++ monorepo. They focus on internal architecture, API boundaries, background workflows, database ownership, and operational commands rather than public-facing product usage.

## Where To Start

Use this site as a map before editing code:

- [Features](/features) describes the app's capabilities from a non-technical perspective.
- [Architecture](/architecture) explains the monorepo shape and ownership boundaries.
- [Backend API](/backend-api) covers authenticated NestJS controllers and the DTO/service/repository flow.
- [Public API](/public-api) covers the token-auth `/public/v1` API surface.
- [Strategy-Aware Conversions](/conversions) covers conversion ledger semantics, goal ingestion, webhooks, and rollout.
- [Temporal Workflows](/workflows) covers orchestrator workflows and activity compatibility rules.
- [Database](/database) covers Prisma schema, migrations, and repository ownership.
- [Frontend API Clients](/frontend-api) covers the SWR and `useFetch` patterns used by the React app.
- [Operations](/operations) covers common root-level commands and deployment-sensitive checks.

## Repository Map

Post++ is a PNPM monorepo:

- `apps/backend` contains the NestJS HTTP API.
- `apps/orchestrator` contains Temporal workers, workflows, and activities.
- `apps/frontend` contains the Next.js React app.
- `libraries/nestjs-libraries` contains shared server-side services, Prisma repositories, integrations, uploads, Temporal registration, and DTOs.
- `libraries/helpers` contains shared helpers used by frontend and server packages.

## Editing Docs

Canonical docs live in `docs/*.md`. Edit them directly, then run:

```bash
pnpm docs:build:nav
```

The sidebar is generated from `scripts/docs-nav.config.mjs` and page headings. Run the full build before pushing docs changes:

```bash
pnpm docs:build
```
