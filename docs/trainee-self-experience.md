# MOB-012 Trainee Self Experience

MOB-012 adds the first real Trainee persona surface on top of the locked React
Navigation foundation. It remains a read-only, Backend-authorized experience.

## Backend Contract Matrix

| Purpose | Method | Route | Ownership |
| --- | --- | --- | --- |
| Authenticated workspace/persona context | `GET` | `/api/v1/me/workspaces` | MOB-012 consumes to find an unambiguous active `TRAINEE` workspace membership. |
| Relationship dashboard summary | `GET` | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/dashboard` | MOB-012 consumes only when a verified coaching `relationshipId` is supplied through the context seam. |

No Backend route was invented for MOB-012. There is no verified `GET /me/relationships`
or unread-count route.

## Context Ownership

MOB-011 deliberately left workspace/persona context as a seam. MOB-012 now loads
`/me/workspaces` for authenticated users and selects a Trainee context only when
there is exactly one active workspace membership containing the verified
`TRAINEE` role. Multiple Trainee contexts fail closed until a later explicit
context selection feature exists.

The Trainee Home can also accept a coaching `relationshipId` seam. That value
must mean the coaching relationship ID. It must not be replaced with user ID,
membership ID, workspace ID, trainer assignment ID, or route-local state.

## Authorization Boundary

The `TRAINEE` role selects the Trainee persona experience. It does not authorize
any API operation. Backend authorization remains authoritative, and MOB-010
access UX remains presentation-only.

MOB-012 does not create a role-to-permission map and does not infer access from
self identity, relationship membership, tab visibility, cached data, or route
selection.

## Trainee Home

The Trainee Home renders verified workspace and membership context. When a
verified relationship ID is available, it reads the Backend-authorized
relationship dashboard and displays only Backend-provided summary facts such as
relationship status, assigned staff count, visible sections, completed sessions,
and active nutrition plan name.

If relationship context is unavailable, the home says so and does not fake a
dashboard.

## Deferred Work

The following remain deferred to later locked issues:

- MOB-015: workout execution, set logging, program-day actions, personal-record
  management.
- MOB-016: meal logging, nutrition plan editing, nutrition adherence mutations.
- MOB-017: measurement entry, check-in submission, progress photos.
- MOB-018: upload intents, presigned upload/download product flows.
- MOB-019: push registration, device tokens, notification settings, invented
  unread-count behavior.

## Query And Session Safety

All Trainee queries use the protected session namespace and include material
context:

- auth generation;
- workspace ID;
- membership ID;
- relationship ID when a relationship endpoint is called.

Auth credentials are never placed in query keys, navigation params, SecureStore,
or screen state. TanStack Query `AbortSignal` is passed through the MOB-007 API
transport for every implemented Backend call.

Generation, workspace, and relationship changes must clear or isolate old
protected data. Late Session A data must not render under Session B.

## Error Semantics

Loading, unavailable, denied, empty, and malformed states are distinct in code.
Network failure is not treated as Backend denial. A `403` from a Trainee call
does not log out the user; authentication/session behavior remains MOB-007 and
MOB-009 territory.

## Offline And Persistence

MOB-012 adds no NetInfo integration, offline queue, background sync, or
local-first protected writes. It does not persist protected API payloads,
navigation state, workspace permission facts, relationship facts, access tokens,
or refresh tokens.

The existing SecureStore refresh-token slot remains the only approved auth
credential persistence.
