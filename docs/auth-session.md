# Mobile Auth Session Lifecycle

MOB-009 connects the locked transport and storage primitives:

- MOB-007 owns native fetch transport, rotating refresh single-flight, and direct
  replay with the freshly returned access token.
- MOB-008 owns the SecureStore primitive for
  `hassan.mobile.secure.auth.native-refresh-token`.
- MOB-009 owns login, bootstrap, logout, in-memory access-token state, refresh
  token persistence decisions, and protected cache clearing.

## Verified Backend Contract

Backend HEAD audited read-only: `d926cacccbfb6cfb68ca578a8d1895be47bf81b1`.

Verified routes:

- `POST /api/v1/auth/login` accepts `{ identifier, password, clientType:
  "MOBILE" }`.
- Login may return `MFA_REQUIRED` with `mfaChallengeToken` and methods `TOTP`
  or `RECOVERY_CODE`.
- `POST /api/v1/auth/mfa/login/verify` completes MFA and returns the native
  token response.
- `POST /api/v1/auth/refresh` accepts `{ clientType: "MOBILE", refreshToken }`
  in JSON.
- Mobile/native token responses include `accessToken`, `refreshToken`, and
  `restrictedUntilVerified`.
- Refresh rotates refresh tokens. Reuse of a consumed refresh token can revoke
  the session family.
- `POST /api/v1/auth/logout` revokes the current bearer-authenticated session
  when the access token still identifies an active session.
- `GET /api/v1/me` is the current-account endpoint. Permission and role policy
  remain backend-authoritative and are not implemented in MOB-009.

Not provided by the verified contract: client-readable token expiry metadata.
MOB-009 does not decode JWTs for authorization or expiry policy.

## State Machine

States:

- `initializing`: bootstrap, login, or MFA completion is in progress.
- `unauthenticated`: no healthy local session.
- `authenticated`: access token is in memory and refresh token was durably
  written to SecureStore.
- `mfa_required`: login requires MFA completion; no credentials are stored.
- `security_failure`: a security-critical storage operation failed or a stale
  credential operation could not be safely committed.

Legal transitions are one-way through explicit operations: bootstrap, login,
MFA completion, logout, terminal refresh failure, and storage failure handling.
MOB-009 avoids contradictory booleans by storing a single status.

## Credential Ownership

Access token:

- Memory only.
- Never persisted to SecureStore or AsyncStorage.
- Never placed in query keys, navigation params, or logs.

Refresh token:

- Stored only in SecureStore through the MOB-008 `SensitiveValueStore`.
- Never falls back to AsyncStorage.
- The current slot is `hassan.mobile.secure.auth.native-refresh-token`.

## Bootstrap And Rotation

Cold start reads the SecureStore refresh credential:

1. Missing value -> `unauthenticated`.
2. Read failure -> `security_failure`.
3. Present value -> one refresh request using JSON `{ clientType: "MOBILE",
   refreshToken }`.
4. Backend rotates `R1 -> R2`.
5. MOB-009 writes `R2` to SecureStore.
6. Only after that write succeeds does MOB-009 commit the in-memory access token
   and `authenticated` state.

If `R2` persistence fails after Backend has accepted `R1`, MOB-009 does not
continue as authenticated. It clears in-memory credentials and protected cache
and enters `security_failure`. It does not reuse `R1`, does not write `R2` to
AsyncStorage, and does not claim rollback.

Native storage failures are treated as credential-state uncertainty, because a
platform API can theoretically mutate the physical slot and then reject. MOB-009
attempts best-effort local cleanup after a failed write. If cleanup cannot be
proven, the current process blocks bootstrap from blindly reading the same slot
again. A process restart cannot preserve that in-memory tombstone; on cold
restart Mobile can only read whatever SecureStore durably contains and rely on
Backend refresh rotation/reuse detection. MOB-009 does not add speculative
durable failure metadata.

## MOB-007 Refresh Callback

MOB-007 calls `onCredentialsRefreshed({ accessToken, refreshToken })` once per
shared refresh flight. MOB-009 captures the session generation when it gives
MOB-007 the refresh token. The callback:

1. persists the rotated refresh token through SecureStore;
2. verifies the generation is still current;
3. commits the new in-memory access token;
4. resolves only after required persistence succeeds.

If persistence fails, the callback rejects. MOB-007 then fails the waiting
requests through its locked terminal refresh path.

## Credential Mutation Coordination

SecureStore is not transactional. MOB-009 serializes only auth refresh-token
mutations with a small Promise queue. Each write/delete is generation-aware.

If an old write finishes after the session changed, MOB-009 repairs the stored
credential to the current generation's token or clears it. If an old logout
delete finishes after a new login began, MOB-009 rewrites the current generation
token so a late delete cannot erase the new session.

This is not a transactional guarantee. It is a process-local ordering and
repair strategy for Mobile auth mutations.

## Logout And Failure Distinctions

Logout clears memory and protected cache immediately, then attempts server
logout and SecureStore deletion.

- If SecureStore delete fails, MOB-009 enters `security_failure` and does not
  claim the device credential was removed.
- If server logout fails but local deletion succeeds, Mobile becomes locally
  unauthenticated and records that server revocation was not confirmed. The
  server session may remain valid until expiry or later revocation.

Terminal refresh failure clears memory, SecureStore credential, and protected
cache. Delete failure is surfaced as `security_failure`.

## Cache And Query Boundary

MOB-009 clears MOB-008 protected query cache on account replacement, logout,
terminal session failure, and failed security-critical credential persistence.
Protected query keys owned by auth/session-aware code include the current
session generation: `["session", generation, ...parts]`. The helper
`setProtectedQueryDataIfCurrent` lets future session-aware query bridges avoid
writing old protected data after logout or account replacement. MOB-009 also
removes protected queries whose generation does not match the current
authenticated generation.

MOB-010 owns permission/context UX. MOB-011 owns role-aware navigation.
