# Database

Post++ uses Prisma with PostgreSQL. Database schema and generated client ownership is centralized under `libraries/nestjs-libraries/src/database/prisma`.

## Schema

The Prisma schema is:

```text
libraries/nestjs-libraries/src/database/prisma/schema.prisma
```

The root scripts use that schema for generation and migrations:

```bash
pnpm run prisma-generate
pnpm run prisma-migrate-deploy
```

## Services And Repositories

Domain folders under `libraries/nestjs-libraries/src/database/prisma` usually pair a service with a repository:

- `posts/posts.service.ts` and `posts/posts.repository.ts`.
- `integrations/integration.service.ts` and `integrations/integration.repository.ts`.
- `pipelines/pipeline.service.ts` and `pipelines/pipeline.repository.ts`.
- `media/media.service.ts` and `media/media.repository.ts`.
- `webhooks/webhooks.service.ts` and `webhooks/webhooks.repository.ts`.

Services own business rules. Repositories own Prisma access. Keep raw Prisma query details out of controllers.

## Migration Safety

The project is production-backed. Schema changes need migration discipline:

- Use Prisma migrations, not raw SQL.
- Review generated SQL before deployment-sensitive changes.
- Preserve existing data unless the user explicitly requested a destructive change.
- Consider backfills or nullable rollout paths for required fields.
- Do not rely on application startup to mutate schema.

## Self-Hosted Migration Adoption

Post++ containers do not change the database schema during application startup. The image contains the workspace-pinned Prisma CLI and generated client, and migrations must succeed before the application container is replaced.

### Fresh Database

Start PostgreSQL, pull the target Post++ image, and run the migration container before starting Post++:

```bash
docker compose up -d postiz-postgres
docker compose pull postiz
docker compose run --rm --no-deps postiz pnpm run prisma-migrate-deploy
docker compose up -d postiz
```

The migration command uses the `DATABASE_URL` configured for the `postiz` Compose service and does not publish the application's ports.

### Existing Database Previously Managed By `prisma db push`

Do this one-time adoption before enabling an automated deployment that runs `prisma migrate deploy`.

1. Stop Post++ writes and take a tested PostgreSQL backup. Keep the previous image and backup available; Prisma migrations do not provide an automatic rollback.
2. Pull the target image and verify the database schema against the migration SQL and the Prisma schema in that exact image. Identify which migrations are already fully reflected in the database. Do not infer adoption from a Prisma error code.
3. Mark the generated baseline as applied only when every object in the historical pre-`20260812120000_channel_interactions` schema has been verified. Verify later objects separately in the next step:

```bash
docker compose run --rm --no-deps postiz pnpm exec prisma migrate resolve \
  --applied 20260812110000_pre_channel_interactions_baseline \
  --schema ./libraries/nestjs-libraries/src/database/prisma/schema.prisma
```

4. In chronological order, mark each later migration as applied only if an operator has verified that its complete SQL change is already present:

```text
20260812120000_channel_interactions
20260812130000_follower_relationship_details
20260813000000_audience_member_note_count
20260813120000_post_webhook_http_logs
20260813130000_align_relationship_fk_name
20260823130000_channel_strategy
```

Use the same `prisma migrate resolve --applied <migration-name> --schema ...` command for each verified migration. Leave unapplied migrations unresolved so `migrate deploy` can apply them.

### Channel strategy migration (`20260823130000_channel_strategy`)

This migration adds `strategyId` and `strategyVersion` on `Integration` (backfilled to `grow_audience` / `1`, then non-null with defaults) and nullable `relationshipStrategyId` and `relationshipStrategyVersion` on audience-member projections and relationship snapshots. Existing projection rows keep their prior grades but become stale until the relationship-grade job recomputes them with matching strategy keys.

**Rollout order**

1. Run `pnpm run prisma-migrate-deploy` (or the Compose migration container) before replacing application containers.
2. Deploy backend, orchestrator, and frontend together so registry, API, Temporal activity, and UI agree on strategy IDs.
3. Verify Settings → Channels reads strategy for a follower-capable integration and unsupported channels show N/A.
4. Change strategy on one internal or test channel; confirm Settings shows the recompute notice and Followers shows the recomputing banner.
5. Wait for relationship grades to return to **current** (projection strategy keys match the integration selection).
6. Confirm Followers default route, filter emphasis, empty-state copy, and assistant opening/questions match the selected strategy.
7. Broaden rollout to production channels.

**Rollback**

- Rolling back application images is safe: stored grades and projection rows remain in the database.
- Do **not** drop the new columns during an incident rollback.
- Older app versions ignore or fall back to **Grow audience** for unknown or missing strategy IDs.
- After rollback, allow the regular relationship-grade schedule to stabilize before planning any later cleanup migration.

**Maintainer: scoring profile changes**

Strategy modules live under `libraries/nestjs-libraries/src/channel-strategies/`. Each strategy exposes an integer `version` and a `getScoringProfile()` profile. When you change scoring weights, coefficients, or triage math in a profile, increment that strategy's `version` in the same change. Stored projections are current only when integration strategy ID/version and projection `relationshipStrategyId`/`relationshipStrategyVersion` match the registry entry; a version bump marks existing grades stale and triggers recomputation. Never edit profile math without a version bump.

5. Run:

```bash
docker compose run --rm --no-deps postiz pnpm run prisma-migrate-deploy
```

Start or recreate Post++ only after it succeeds. If verification or migration fails, keep Post++ stopped, investigate, and restore the backup before returning to the previous image when recovery is required.

Never automate `migrate resolve` for an unknown or merely populated database.

The manual GitHub Action **Adopt Prisma baseline** runs the six historical `--applied` resolves above, then `migrate deploy`, then recreates Post++. It only starts if you type this confirmation string exactly:

```text
I have a tested backup and verified the existing database schema matches the v1.4.5 migrations
```

It does not run on tag pushes or regular Deploy jobs. Do not use it unless you have already completed the backup and schema verification steps.

## Data Model Hotspots

The `Organization` model is central and relates to many areas:

- Users and organizations.
- Integrations and OAuth applications.
- Posts, media, sets, signatures, and webhooks.
- Pipelines and autopost.
- Followers, channel interactions, channel analytics, and relationship grades.
- Logs for posts and webhooks.

When adding an organization-scoped model, add indexes for the organization key and any high-cardinality query filters used by list endpoints.

## Adding Database Behavior

When adding database behavior:

1. Add DTOs for API input if the change is request-facing.
2. Add or update a service method for business rules.
3. Add or update a repository method for Prisma access.
4. Add indexes in `schema.prisma` for new query paths.
5. Generate Prisma client with `pnpm run prisma-generate`.
6. Add tests around service behavior and any migration-sensitive edge cases.
