# Mobile API Transport

MOB-007 adds the Mobile HTTP transport foundation under `src/api`. It is a
transport module only. It does not implement product endpoint services, auth
state, SecureStore, query caching, forms, navigation, notification UX, or file
flows.

## Architecture

`createApiClient` builds a small typed interface around native `fetch`.

The module owns:

- configured Backend URL composition;
- `/api/v1` path prefixing;
- query serialization;
- JSON request/response handling;
- backend and transport error normalization;
- optional bearer/support/idempotency headers;
- native refresh transport coordination;
- at-most-once 401 replay.

Callers own endpoint-specific DTO choice and product behavior.

## Base URL

The default base URL comes from `publicClientConfig.backendBaseUrl`, which is
fed by `EXPO_PUBLIC_API_BASE_URL`. Call sites pass relative API paths such as
`/me`. The client composes:

```text
configured Backend base + /api/v1 + relative path
```

Absolute endpoint URLs and protocol-relative paths are rejected so ordinary
calls cannot silently bypass the configured Backend origin.

## Auth Seam

The transport accepts an injected auth seam:

- `getAccessToken`
- `getRefreshToken`
- `onCredentialsRefreshed`
- `onSessionExpired`

MOB-007 never persists tokens and never reads AsyncStorage or SecureStore for
credentials. MOB-008 owns secure persistence primitives. MOB-009 owns auth
lifecycle and can provide this seam later.

## Native Refresh

Mobile/native refresh uses the verified JSON/body contract:

```json
{
  "clientType": "MOBILE",
  "refreshToken": "..."
}
```

The refresh token is supplied by the injected seam. Refreshed access and rotated
refresh tokens are returned through `onCredentialsRefreshed`.

Because Backend refresh tokens rotate, the client uses single-flight refresh per
client instance. Concurrent 401s wait for the same refresh request, so they do
not submit the same rotating refresh token multiple times.

Refresh requests never recursively refresh. Each original request may replay at
most once after a successful refresh.

## Idempotency And Retry Safety

Idempotency is command-specific. The transport only sends `Idempotency-Key` when
the caller explicitly supplies one.

A 401 replay preserves the original idempotency key. The transport does not
retry ambiguous network failures, timeouts, 5xx responses, expected-version
conflicts, or idempotency conflicts.

## expectedVersion

`expectedVersion` is ordinary request DTO data. The transport does not infer,
increment, replace, refetch, or retry CAS values.

## Query And Dates

Query serialization preserves opaque strings, booleans, numbers, repeated array
values, date-only strings, and offset timestamps as supplied. The transport does
not parse cursors, convert date-only strings, assume UTC, or add/subtract local
days. MOB-008 owns date/time utilities.

## Response Handling

The client handles:

- JSON request bodies;
- JSON responses;
- `204` or empty success responses;
- malformed JSON;
- non-JSON proxy/server errors;
- backend error envelopes.

## Errors

`ApiClientError` distinguishes backend, network, and transport errors. Backend
error fields are preserved when present so later UI can map validation,
authentication, permission, relationship access, expected-version, idempotency,
entitlement, quota, file/provider, and not-found cases.

## Cancellation And Timeout

The client passes caller-supplied `AbortSignal` to native `fetch` and normalizes
abort failures. It does not impose a default timeout. Request-specific timeout
policy belongs to future application layers.

## Support Context

`supportSessionId` is an explicit inert transport option. The client does not
derive it from user roles, attach it automatically, or implement support
workflows.

## File And Notification Boundaries

MOB-007 does not solve provider-independent direct object upload. MOB-006 found
that upload intent responses do not expose a generic provider-signed headers
map. MOB-018 owns product file/document flows.

MOB-007 does not implement push registration or notification product behavior.
MOB-019 owns notification/push UX.

## Scope Guards

The Mobile V1 transport does not expose a gym dashboard service. Gym dashboard
remains Backend reference only. Trainer and relationship analytics can be added
later according to role/scope requirements.
