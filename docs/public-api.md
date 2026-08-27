# Public API

The public API is the token-auth API intended for external automation clients. It is separate from the authenticated app API used by the frontend.

## Module Wiring

`apps/backend/src/public-api/public.api.module.ts` registers `PublicIntegrationsController` and applies `PublicAuthMiddleware`.

The current controller lives at:

```text
apps/backend/src/public-api/routes/v1/public.integrations.controller.ts
```

Its controller prefix is `/public/v1`.

## Route Surface

The current public API surface includes:

- Media upload: `POST /upload`, `POST /upload-from-url`.
- Scheduling discovery: `GET /find-slot/:id`.
- Posts: `GET /posts`, `POST /posts`, `DELETE /posts/:id`, `DELETE /posts/group/:group`.
- Integrations: `GET /is-connected`, `GET /groups`, `GET /integrations`, `GET /social/:integration`, `DELETE /integrations/:id`.
- Notifications: `GET /notifications`.
- Video generation: `POST /generate-video`, `POST /video/function`.
- Integration settings: `GET /integration-settings/:id`.
- Post maintenance: `GET /posts/:id/missing`, `PUT /posts/:id/settings`, `PUT /posts/:id/status`, `PUT /posts/:id/release-id`.
- Analytics: `GET /analytics/:integration`, `GET /analytics/post/:postId`.
- Integration triggers: `POST /integration-trigger/:id`.
- Conversions: `POST /conversions`, `POST /conversions/support-resolution`.

See [Strategy-Aware Conversions](/conversions) for goal ingestion, attribution precedence, idempotency, and webhook details.

Use route decorator search to refresh this list:

```bash
rg '@(Get|Post|Put|Delete|Patch)\(' apps/backend/src/public-api/routes
```

## Authentication

Public API authentication is handled by `PublicAuthMiddleware`, not the app `AuthMiddleware`. Public API handlers should rely on organization context from that middleware and should not accept organization identity from request bodies.

## Validation And Safety

Public API handlers are externally reachable, so validation needs to be stricter than internal UI-only flows.

Current safety-sensitive examples:

- `upload-from-url` uses `ssrfSafeDispatcher` before fetching remote media.
- Remote upload checks content length, buffers defensively, sniffs MIME type, and enforces allowed media types.
- Public API requests increment Sentry metrics with `Sentry.metrics.count('public_api-request', 1)`.

When adding public endpoints:

- Use DTOs from `libraries/nestjs-libraries/src/dtos`.
- Keep organization scoping server-derived.
- Reuse existing services instead of duplicating business logic in the controller.
- Review file, URL, webhook, and integration-trigger inputs for abuse paths.
- Add tests for request validation and authorization behavior.

## Relationship To SDKs

The public API is the backend surface that SDKs and automation integrations should use. Keep backward compatibility in mind for route paths, request bodies, and response shape.

If a breaking change is unavoidable, prefer versioning under a new public API namespace rather than changing `/public/v1` behavior in place.
