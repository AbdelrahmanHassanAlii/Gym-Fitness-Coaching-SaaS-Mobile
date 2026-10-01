# Backend Contracts And Mobile DTO Strategy

MOB-006 verifies the locked Backend V1 implementation for Mobile-facing contract
work and establishes the first Mobile-owned DTO seam. It does not implement an
API client, token storage, auth lifecycle, permissions UX, product navigation, or
domain screens.

## Evidence Baseline

Backend source inspected read-only:

- Repository: `https://github.com/AbdelrahmanHassanAlii/Gym-Fitness-Coaching-SaaS-Backend.git`
- Local path: `D:/Hasssan/Edara/Gym & Fitness Coaching SaaS/apps/backend`
- Audited HEAD: `d926cacccbfb6cfb68ca578a8d1895be47bf81b1`
- Backend working tree: no tracked file changes from MOB-006; local backend
  branch is ahead of `origin/main` and was not modified.

Primary evidence:

- route files under `src/modules/**`
- TypeBox schemas under `src/modules/**`
- auth, access-control, idempotency, storage, notification, and analytics services
- Backend V1 frontend integration docs under `docs/v1`
- current OpenAPI exporter `scripts/export-openapi.ts`
- current root Apidog artifact under `docs/apidog/openapi.json`

## OpenAPI Revalidation

Current generator:

- package script: `openapi:emit`
- script: `apps/backend/scripts/export-openapi.ts`
- app builder: `src/api/build-app.ts`
- output: workspace-root `docs/apidog/openapi.json`

Fresh export was generated with the same Bun script used by `openapi:emit`.
The package-manager wrapper attempted network metadata access in this sandbox,
so the script was invoked directly for analysis.

Fresh/current artifact counts:

| Metric | Count |
| --- | ---: |
| Paths | 197 |
| Operations | 233 |
| `GET` | 78 |
| `POST` | 121 |
| `PUT` | 10 |
| `PATCH` | 17 |
| `DELETE` | 7 |

Checked-in status: the current root Apidog artifact already matches the fresh
233-operation generation hash observed during MOB-006. Historical reports of a
188-operation artifact are stale for the current workspace state.

OpenAPI is useful for shapes, route inventory, tags, and many request/response
schemas. It is not sufficient by itself for Mobile because it does not fully
encode auth semantics, support-session behavior, true idempotency requirements,
scope rules, provider upload headers, pagination binding, or all error behavior.

## Confidence Classification

Use these labels in future contract notes:

- `VERIFIED_FROM_IMPLEMENTATION`: route/service/schema/test evidence is direct.
- `VERIFIED_FROM_OPENAPI_AND_IMPLEMENTATION`: OpenAPI shape and implementation
  agree.
- `DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI`: backend behavior is
  implemented or documented, but OpenAPI metadata is incomplete.
- `PROVIDER_DEPENDENT`: behavior depends on object storage, email, push, or a
  similar provider and cannot be proven by the backend alone.
- `UNVERIFIED_FOLLOW_UP`: do not guess DTO fields or client behavior yet.

## Mobile-Relevant Contract Inventory

Mobile V1 is one role-aware client for Trainee, Trainer, Assistant Trainer, and
Nutritionist. Mobile should model only APIs relevant to those roles and must not
copy Platform Admin surfaces merely because the backend exposes them.

Relevant areas:

- Auth/account: register, login, MFA challenge/verify, refresh, logout, current
  user/session, workspace list.
- Workspace context: selected workspace id, accessible workspaces, workspace
  membership and role context.
- Permissions/access: backend-authoritative roles, scopes, explicit allow/deny,
  support-sensitive restrictions.
- Relationships: `relationshipId` identifies a coaching relationship, not a
  trainee user id, membership id, or trainer assignment id.
- Training/workouts: relationship-scoped program and workout reads/writes,
  expected-version updates, PR reads.
- Nutrition: food/nutrition plan reads/writes scoped to workspace/relationship.
- Progress/check-ins: date-sensitive relationship data, recurrence, submission,
  review, support-sensitive reads.
- Files/documents: upload intent, direct object upload, confirmation, document
  metadata, download URL, delete/restore.
- Notifications/push: in-app notification list, mark read/read-all, preferences,
  push device register/revoke.
- Dashboards/analytics: trainer, gym, relationship dashboards, relationship
  training/progress/nutrition/adherence analytics.
- Support context: `x-support-session-id` can affect auth/access behavior but is
  not a normal Mobile user flow.
- Subscription/entitlement/quota errors: may be received by Mobile even when a
  permission check passes.

## Native Auth Contract

Verified from `auth.routes.ts` and `auth.schemas.ts`:

- Native Mobile sends `clientType: "MOBILE"`.
- Login/register/MFA completion return `accessToken`; refresh token is omitted
  for `WEB` cookie clients but included for non-Web clients when issued.
- Refresh endpoint accepts `{ clientType: "MOBILE", refreshToken }` in JSON.
- Refresh rotates tokens through backend refresh-token service.
- Reuse of a consumed refresh token can revoke the session family.
- Logout is exposed but Mobile auth lifecycle and token storage belong to
  MOB-009/MOB-008.
- Authenticated requests use bearer access tokens.
- MFA can return `MFA_REQUIRED` with challenge token and available methods
  `TOTP` or `RECOVERY_CODE`.

Secure storage boundary:

- Current `AsyncStorage` is only for non-sensitive language/theme/appearance.
- Future SecureStore-sensitive material includes native refresh token and any
  other verified long-lived auth/session secret.
- MOB-006 stores no tokens and implements no SecureStore.

## Idempotency Summary

Do not assume every mutation requires `Idempotency-Key`. OpenAPI exposes the
header broadly, but real requirements come from route wrappers calling backend
idempotency service.

Mobile-relevant commands verified as `REQUIRED`:

- create trainee invitation, accept trainee invitation, relationship lifecycle
  and assignment commands
- program template/program/nutrition plan command wrappers
- workout start/update/complete/abandon/correct and day skip/defer commands
- progress write commands that use the progress route idempotency wrapper
- check-in assignment/submit/review command wrapper
- create upload intent, confirm upload, delete file, restore file, create
  document, delete document

Verified `NOT_REQUIRED` examples:

- reads/lists
- file download URL
- notification mark read, mark all read, preference update, push register,
  push revoke

MOB-007 owns request-header mechanics and retry behavior.

## expectedVersion / CAS Summary

Mobile-relevant mutation flows with verified `expectedVersion` fields include:

- relationship lifecycle and assignment changes
- program template revision/archive, program revise/activate/complete/archive
- nutrition plan revise/activate/complete/archive
- workout update/complete/abandon/correct and training day skip/defer
- check-in template revision/archive, assignment update/end, submit/review
- file upload confirm, file delete/restore, document delete
- notification preferences update

The source version is the latest returned DTO `version` or module-specific
revision/access version. Conflict behavior is a backend 409-style error; Mobile
should refetch and ask the user to reconcile instead of automatic blind retry.

## Permissions And Scope

Backend authorization is authoritative. Mobile roles drive UX only.

Mobile must preserve these backend concepts:

- `SELF`: trainee's own coaching relationship.
- `ASSIGNED_TRAINEES`: staff access to assigned relationships.
- `SPECIFIC_TRAINEES`: explicit relationship grants.
- `BRANCH` / `MULTIPLE_BRANCHES`: branch-scoped visibility.
- `WORKSPACE`: workspace-wide visibility where permission allows.
- explicit `DENY` can override `ALLOW` at the same specificity.
- assistant trainer and nutritionist restrictions are backend-enforced through
  permission/profile/scope and relationship assignment checks.
- support context is separate and may require `x-support-session-id` plus
  support-sensitive permissions.

Permission success does not bypass entitlement, quota, lifecycle, support,
retention, file-state, or expected-version checks.

## Pagination And Cursor Shapes

Do not force every endpoint into one cursor type.

- Ordinary cursor pages: many list routes expose `cursor`, `limit`, and
  `data` plus page metadata.
- Notification pages: return `page.nextCursor`, not `pageInfo`.
- File document list: returns `pageInfo`, but continuation should prefer
  `nextCursor`; backend docs note a historical `hasMore` quirk.
- Analytics dashboards: grouped independent cursors exist for attention,
  branch, and activity categories.
- Category-bound cursors: analytics activity/attention cursors are bound to
  category/filter context.

## Time And Timezone Rules

Mobile must preserve backend date semantics:

- date-only values are calendar dates, not timestamps.
- timestamp values must include `Z` or an explicit offset.
- naive timestamps are not safe client contracts.
- analytics use workspace IANA timezone and server-authoritative ranges.
- date ranges are `[from, to)`.
- local midnight interpretation belongs to the workspace timezone.
- DST means one local day is not always `+24h`.
- weeks are local Monday-start where documented.
- check-in recurrence carries timezone semantics and must not be flattened into
  device-local arithmetic.

MOB-008 owns date/time utility infrastructure.

## File And Document Contract

Verified from file schemas, routes, storage provider, service docs:

- Upload intent reserves quota and returns `uploadIntentId`, `uploadUrl`,
  expiries, reserved bytes, and expected version.
- Direct object upload is to object storage, not the backend API.
- S3-compatible provider signs upload URLs with `content-length`,
  `content-type`, `if-none-match: *`, and `x-amz-checksum-sha256` when supplied.
- The API response does not currently echo a signed provider `headers` object.
  Mobile can infer required headers from the upload-intent request fields and
  docs, but provider-specific upload proof remains `PROVIDER_DEPENDENT`.
- Confirmation performs provider `HEAD`, validates object key, size, MIME type,
  and checksum metadata when expected.
- Sensitive categories are `INBODY`, `BLOOD_TEST`, `MEDICAL_REPORT`,
  `INJURY_REPORT`.
- Downloads use short-lived signed URLs and should not be logged or cached beyond
  expiry.
- Delete/restore/document delete require `expectedVersion` and idempotency.

Known provider-dependent QA: checksum mismatch and quota/upload reservation can
be tested through fake/provider integration, but real provider behavior remains
provider-dependent.

## Notification And Push Contract

Verified from notification routes/service:

- `GET /api/v1/me/notifications` supports `cursor`, `limit`, `unread`.
- There is no exact unread-count route in V1.
- mark-read and read-all routes exist.
- preferences have `expectedVersion` and channel/event preferences.
- preferences affect delivery processing; in-app notification creation is not
  proven to be suppressed by disabled in-app preferences for all events.
- push device registration and revocation exist.
- no push device list route exists in V1.

MOB-019 owns product notification/push behavior. MOB-007 owns transport.

## Dashboard And Analytics Contract

Mobile-relevant Stage 18 routes:

- trainer dashboard
- gym dashboard where a role/scope allows it
- relationship dashboard
- relationship training analytics
- relationship progress analytics
- relationship nutrition analytics
- relationship adherence analytics

Semantics:

- empty sections are valid successful responses.
- dashboard categories can have independent cursors.
- ratios/nulls must be preserved rather than coerced to zero.
- query ranges are server/workspace-timezone interpreted.
- progress analytics supports `none`, `day`, `week`, `month` granularities and
  ordinary cursor/limit.

## Error Contract

Mobile must recognize backend error classes without binding UI policy here:

- validation errors
- authentication required/session expired/restricted session
- MFA required or verification conflicts
- permission/access denied, relationship access denied
- not found
- expected-version conflict
- idempotency conflict/replay mismatch
- entitlement/subscription/quota failures
- file/provider/checksum/storage errors
- support-sensitive denial

All UI presentation belongs to later product issues.

## DTO Strategy

MOB-006 chooses a hybrid strategy:

- OpenAPI can support future route inventory and shape checks.
- Mobile owns handwritten DTOs for the contract seam under `src/contracts`.
- Behavioral constraints remain curated from implementation evidence and docs.
- No generated API client is added in MOB-006.
- No Backend TypeScript source imports, Web imports, shared repository, submodule,
  symlink, or fourth package are used.

Organization:

```text
src/contracts/
  common/
  auth/
  relationships/
  files/
  notifications/
  analytics/
```

DTO conventions:

- request DTOs describe wire request bodies/query objects.
- response DTOs describe backend wire responses.
- API literals/enums are exported as readonly arrays plus union types.
- semantic ids use branded string aliases to avoid mixing `relationshipId` with
  user, membership, file, or document ids.
- wire DTOs are not UI/view models; feature modules may map them later.
- runtime guards are small and reserved for values Mobile must branch on before
  MOB-007/MOB-009 exist.

## Scope Boundaries

Not implemented by MOB-006:

- API client / transport / retry / headers
- SecureStore or token persistence
- query cache, forms, date utilities
- auth account lifecycle
- permission hooks or permission UX
- role-aware navigation
- product/domain screens
- Backend or Web changes
