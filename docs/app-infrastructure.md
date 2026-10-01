# Mobile App Infrastructure

MOB-008 adds reusable infrastructure for secure sensitive storage, server state,
forms, and date/time handling. It does not implement auth lifecycle, product
screens, navigation, file flows, push behavior, or permissions UX.

## Secure Storage

Sensitive storage lives behind `src/storage`. The only current sensitive slot is
the future native refresh-token slot:

```text
hassan.mobile.secure.auth.native-refresh-token
```

The key is a stable app identifier. It does not include a raw token, user email,
workspace data, or other sensitive payload.

The implementation delegates to `expo-secure-store` and exposes:

- `read`
- `write`
- `delete`

Failures are wrapped in `SecureStorageError` with the operation and key. There
is no AsyncStorage fallback for sensitive values. This is deliberate: if
SecureStore fails, future auth code must make a security-safe decision rather
than silently persisting credentials in non-sensitive preference storage.

MOB-008 does not store a real token. MOB-009 owns login, logout, token
restoration, rotation persistence, and session failure behavior.

## Rotating Refresh Boundary

The intended future sequence is:

1. MOB-007 refresh transport receives `access-B` and rotated `refresh-R2`.
2. MOB-007 calls the injected `onCredentialsRefreshed` seam.
3. MOB-009 persists `refresh-R2` through this MOB-008 SecureStore abstraction.
4. MOB-009 updates in-memory access-token state and continues the session only
   if its lifecycle rules say that is safe.

SecureStore writes are not claimed to be transactional. If Backend rotates
`R1 -> R2` but storing `R2` fails, MOB-009 must not casually continue as though
durable rotation succeeded.

## Query Client

`src/query` owns one stable application `QueryClient` and `AppInfrastructureProvider`
mounts it once at the app root.

Defaults are conservative for mobile:

- mutation retry is disabled;
- query retry is bounded to two attempts;
- 400, 401, 403, 404, 409, and 422 are not retried;
- network failures and selected transient server statuses may retry;
- web focus refetch is disabled.

React Native AppState focus and NetInfo online integration are deferred. MOB-008
does not add an offline queue or background sync. Ambiguous mutation failures
remain application decisions, preserving MOB-007 retry safety.

`createApiQueryFn` passes TanStack Query's `AbortSignal` into the MOB-007
transport request. It does not alter MOB-007 refresh coordination.

## Query Keys And Cache Boundary

Query keys use a small convention:

```text
scope, entity, { role, relationshipId, filters, page }
```

Scopes are `public` and `session`. Secrets, tokens, credentials, authorization
headers, and signed URLs are rejected by key field name. Future MOB-009 code can
call `clearProtectedQueryCache` on logout, session expiry, or account change so
previous account data is not displayed after a session transition.

## Pagination

MOB-006 identified multiple Backend pagination shapes, so MOB-008 does not add a
universal cursor DTO. Infinite pagination helpers accept endpoint-specific
`getNextPageParam` logic and preserve opaque cursors unchanged.

## Forms And Validation

React Hook Form is the form infrastructure. MOB-008 adds generic defaults and a
small adapter for verified Backend `fieldErrors` details when present.

No product form is implemented. No schema library is added in MOB-008. Backend
validation remains authoritative, and endpoint-specific client validation can be
added with product forms when their DTOs and UX exist.

## Date And Time

`DateOnly` is a business-local `YYYY-MM-DD` value and is preserved lexically. It
is never converted to midnight UTC or device-local midnight by MOB-008.

Timestamps are instants and must include `Z` or an explicit offset. Formatting an
instant requires an explicit locale and IANA timezone, keeping Arabic/English and
workspace-timezone display choices visible to callers.

`[from,to)` ranges preserve exclusive `to`. Helpers do not convert to inclusive
end-of-day and do not subtract milliseconds.
