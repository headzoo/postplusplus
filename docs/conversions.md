# Strategy-Aware Conversions

Post++ records durable, organization-scoped conversion events in a canonical ledger. Conversion semantics come from the channel strategy active when evidence is produced. Conversions are kept separate from `ChannelAnalyticsDailyPoint`; summaries are computed from the ledger at query time.

## Strategy Meanings

Each channel strategy exposes an immutable conversion profile through `getConversionProfile()`:

| Strategy | Profile kind | Conversion type | Trigger |
| --- | --- | --- | --- |
| `grow_audience` | follower transition | `follower_gained` | `NOT_FOLLOWER -> FOLLOWER` membership transition |
| `community_retention` | follower transition | `follower_gained` | Same follower transition semantics |
| `lead_capture` | website goal | `website_goal` | Attributed goal via `pp_click_id` or exact UTM fingerprint |
| `brand_awareness` | amplification | `amplification_threshold` | Rolling inbound mention/repost score over 7 UTC days |
| `customer_support` | customer support | `support_sla_hit`, `support_issue_resolved` | First outbound within 24h SLA; explicit resolution |

Interacting or manually added leads are stored as `NOT_FOLLOWER` once membership evidence exists (completed follower sync, bridge discovery, or Add lead), so a later follow-back is recorded as `follower_gained`.

Strategy changes affect only future evidence. Existing ledger rows, queued jobs, click attributions, and support cases keep their captured `strategyId` and `strategyVersion`.

## HTTP Surfaces

### Authenticated app API

Registered by `ConversionsController` under `/conversions`:

- `GET /conversions/:integrationId` — cursor-paginated ledger reads with optional UTC date range, `conversionType`, and `strategyId` filters.
- `GET /conversions/:integrationId/summary` — grouped counts by UTC day and conversion type (no analytics-point writes).
- `POST /conversions/:integrationId/goals` — API-key/session-authenticated goal ingestion for the route integration.
- `POST /conversions/:integrationId/support-resolution` — explicit support resolution when the route integration matches the body.

Webhook credential management lives on `IntegrationsController`:

- `POST /integrations/:id/conversion-webhook-credential` — rotate the bearer credential. Returns `{ token }` **once**; only a hash is stored server-side.
- `GET /integrations/:id/conversion-webhook-credential` — returns `{ configured, lastFour, createdAt, rotatedAt }` without the secret.

### Public API (`/public/v1`)

Token-auth automation clients use:

- `POST /public/v1/conversions` — goal ingestion; `integrationId` is required in the body.
- `POST /public/v1/conversions/support-resolution` — explicit support resolution.

Organization identity always comes from `PublicAuthMiddleware`, never from the request body.

### Conversion webhooks

Unauthenticated-by-session webhook ingestion:

- `POST /conversion-webhooks/:integrationId`

Send `Authorization: Bearer <rotated-secret>`. Unknown integrations and invalid credentials both return `401` without leaking credential state.

## Goal Ingestion Examples

### Public API with click attribution

```http
POST /public/v1/conversions
Authorization: Bearer <public-api-token>
Content-Type: application/json

{
  "integrationId": "integration-a",
  "eventId": "crm-goal-123",
  "goal": "signup",
  "occurredAt": "2026-08-27T15:04:00.000Z",
  "attribution": {
    "ppClickId": "<opaque-click-id-from-post-link>"
  },
  "actorExternalId": "visitor-42",
  "userProperties": { "plan": "trial" },
  "metadata": { "source": "marketing-site" }
}
```

Response:

```json
{
  "created": true,
  "conversion": {
    "id": "evt-1",
    "strategyId": "lead_capture",
    "strategyVersion": 1,
    "conversionType": "website_goal",
    "source": "API",
    "attributionMethod": "CLICK_ID"
  }
}
```

### Webhook goal ingestion

```http
POST /conversion-webhooks/integration-a
Authorization: Bearer <rotated-webhook-secret>
Content-Type: application/json

{
  "eventId": "webhook-goal-456",
  "goal": "purchase",
  "attribution": {
    "ppClickId": "<opaque-click-id-from-post-link>"
  }
}
```

### UTM fallback (no click ID)

UTM fallback is allowed only when **no** `ppClickId` is supplied, the integration belongs to the authenticated organization, the integration strategy is `lead_capture`, and the normalized UTM fingerprint exactly matches a non-expired attribution row created during link preparation.

```json
{
  "integrationId": "integration-a",
  "eventId": "utm-goal-789",
  "goal": "demo_booked",
  "attribution": {
    "utm_source": "post",
    "utm_campaign": "spring"
  }
}
```

If a `ppClickId` is supplied but invalid or expired, the request fails. The service does **not** fall back to UTM when click attribution fails.

## Click Over UTM Precedence

1. Lead-capture post save injects a deterministic `pp_click_id` (HMAC over organization, integration, strategy/version, post item ID, and canonical destination URL using `JWT_SECRET`).
2. Attribution rows are stored before post content is saved.
3. Goal ingestion with a valid `pp_click_id` pins attribution to the strategy/version captured at link preparation time.
4. Invalid or expired click IDs reject the request; UTM is never used as a fallback in that case.

## Explicit Support Resolution

```http
POST /public/v1/conversions/support-resolution
Authorization: Bearer <public-api-token>
Content-Type: application/json

{
  "integrationId": "integration-a",
  "eventId": "resolve-123",
  "externalCaseKey": "conversation:thread-abc",
  "occurredAt": "2026-08-27T16:00:00.000Z"
}
```

Provide exactly one of `caseId` or `externalCaseKey`. Replaying the same `eventId` returns the existing result and does not create another ledger event.

## List And Summary Filters

List query parameters:

- `take` — page size (1–100, default 50).
- `cursor` — opaque cursor from a previous response.
- `from` / `to` — bounded UTC date range; both are required together.
- `conversionType` — optional filter.
- `strategyId` — optional filter.

Summary requires both `from` and `to` UTC dates and returns `{ day, conversionType, count, value }[]`.

## Idempotency And Safe Retries

- Ledger rows enforce `@@unique([integrationId, dedupeKey])`.
- Goal ingestion dedupe key: `{source}:goal:{eventId}`.
- Replaying the same external `eventId` returns `{ created: false, conversion: ... }`.
- Webhook and public API clients should treat `400` validation failures as non-retryable unless the payload changes.
- Transient `5xx` responses can be retried with the same `eventId`; duplicates remain safe.

## Attribution Expiry

Lead-capture attributions expire after the strategy profile window (30 days for version 1). Expired click IDs and UTM fingerprints reject ingestion with a client error.

## Background Evaluation

Interaction-derived and membership-derived conversions enqueue `ConversionEvaluationJob` rows in the same transaction as accepted evidence. `conversionEvaluationWorkflowV1` in the orchestrator drains due jobs through versioned activities. This workflow is additive; existing workflow signatures are unchanged.

Conversion evaluation never writes `ChannelAnalyticsDailyPoint` rows.

## Deployment And Rollback

Apply changes in this order:

1. **Database** — deploy the additive Prisma migration (`20260827101400_strategy_aware_conversions`) with `pnpm run prisma-migrate-deploy`.
2. **Application workers** — deploy backend and orchestrator together so API/webhook ingestion and `conversionEvaluationWorkflowV1` are both available.
3. **Verification** — confirm the new workflow is registered and running in Temporal, then enable client integrations (public API goals, webhook credentials, or UI consumers of list/summary endpoints).

Rollback behavior:

- Stop new ingestion and pause or disable the conversion evaluation worker if needed.
- Retain additive tables and the immutable ledger; do not delete production conversion data as part of rollback.
- Older backend/orchestrator versions simply ignore the new tables until the migration is applied again.
