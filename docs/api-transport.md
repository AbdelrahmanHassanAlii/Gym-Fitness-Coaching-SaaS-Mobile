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
- protected transport header control;
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
calls cannot silently bypass the configured Backend origin. If a caller
accidentally includes `/api/v1` at the start of the relative path, the transport
normalizes it so the final URL still has a single API prefix.

Custom request headers are allowed for harmless request-specific metadata, but
the transport controls `Authorization`, `Cookie`, `Idempotency-Key`, and
`x-support-session-id` case-insensitively. Callers must use the dedicated
request options for bearer tokens, idempotency, and support session context.

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

The refresh flight's returned credentials directly supply the access token for
all participating replays; replay does not depend on rereading auth state after a
future persistence callback. `onCredentialsRefreshed` runs once per refresh
flight. If that callback rejects, the refresh is treated as failed, waiting
requests do not replay with stale credentials, `onSessionExpired` is notified,
and the flight is cleared for a later session attempt.

Refresh requests never recursively refresh. Each original request may replay at
most once after a successful refresh. If a caller aborts while waiting for a
shared refresh, that request fails as aborted and does not cancel the shared
refresh for other waiters.

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

Query serialization skips `undefined` and `null`, preserves `false`, `0`, empty
strings, opaque strings, booleans, numbers, repeated array values, date-only
strings, offset timestamps, and safely URL-encodes Unicode/reserved characters.
The transport does not parse cursors, convert date-only strings, assume UTC, or
add/subtract local days. MOB-008 owns date/time utilities.

## Response Handling

The client handles:

- JSON request bodies, including `null`, booleans, numbers, strings, and
  objects when explicitly supplied;
- JSON responses;
- `204` or empty success responses;
- malformed JSON;
- non-JSON proxy/server errors;
- backend error envelopes.

An `undefined` body is omitted. MOB-007 does not implement binary or raw upload
body handling.

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
