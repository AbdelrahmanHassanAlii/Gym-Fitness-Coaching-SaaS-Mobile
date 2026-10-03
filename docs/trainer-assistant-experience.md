# MOB-013 Trainer And Assistant Trainer Experience

MOB-013 adds the read-only Trainer and Assistant Trainer Mobile V1 experience
on top of the locked React Navigation, auth generation, permission UX, and live
workspace context foundations.

Backend authorization remains authoritative. Trainer and Assistant Trainer roles
select persona presentation only; they do not grant API access.

## Backend Contract Matrix

| Purpose | Method | Route | Ownership |
| --- | --- | --- | --- |
| Authenticated workspace/persona context | `GET` | `/api/v1/me/workspaces` | Shared context foundation from MOB-012. MOB-013 consumes it for exactly one active `TRAINER` or `ASSISTANT_TRAINER` context. |
| Staff relationship list | `GET` | `/api/v1/workspaces/:workspaceId/relationships` | Backend-authorized relationship source for the current workspace. Mobile does not infer assignments from role or workspace membership. |
| Relationship dashboard summary | `GET` | `/api/v1/workspaces/:workspaceId/relationships/:relationshipId/dashboard` | Backend-authorized relationship summary. Mobile guards workspace, relationship, and actor kind before display. |

MOB-013 invents no Backend route. It does not use Trainer or Assistant role as
a substitute for Backend relationship access.

## Shared Workspace Context

MOB-012 owns the generation-bound `/me/workspaces` query. MOB-013 reuses the
same shared parser and resolver instead of creating a competing provider.

Trainer and Assistant contexts resolve only when there is exactly one active
supported context. Multiple Trainer/Assistant contexts or multi-role ambiguity
fail closed until an explicit, verified selector exists. Backend array order is
not a hidden default.

## Relationship Source

`relationshipId` always means the coaching relationship ID. MOB-013 obtains it
from the verified Backend relationship list. It must never be replaced with a
trainee user ID, membership ID, workspace ID, assignment ID, or route-local
guess.

The dashboard query is disabled until a relationship row from the verified list
is selected.

## Trainer And Assistant Boundary

Trainer and Assistant Trainer are distinct personas. They may share the same
screen structure in MOB-013, but this does not imply equal Backend permission.
The dashboard guard requires Backend `access.actorKind` to match the current
persona.

There is no role-to-permission map and no local privilege hierarchy.

## Deferred Work

The following remain deferred to later issues:

- MOB-014: Nutritionist workflows.
- MOB-015: workout authoring, workout execution, set editing, and personal
  records.
- MOB-016: nutrition logging and nutrition plan workflow.
- MOB-017: progress mutations, check-ins, and photo workflows.
- MOB-018: file upload and presigned URL flows.
- MOB-019: push registration, device tokens, notification settings, and unread
  counts.

MOB-013 displays only Backend-provided relationship summaries and dashboard
summary facts. It does not fabricate scores, streaks, priorities,
recommendations, calories, or unread counts.

## Query And Race Safety

Staff queries use the protected session namespace and include material context:

- auth generation;
- workspace ID;
- membership ID;
- persona;
- relationship ID for dashboard queries.

Auth credentials are never placed in query keys, navigation params, SecureStore,
or screen state. TanStack Query `AbortSignal` is passed to MOB-007 transport.
Session, workspace, persona, and relationship replacement must prevent stale
data from rendering under the new context.

## Error Semantics

`401` remains MOB-007/MOB-009 authentication territory. `403` renders the staff
experience as unavailable or denied without logging out. Network and 5xx
failures are unavailable states, not Backend denial.

## Offline And Persistence

MOB-013 adds no NetInfo integration, offline queue, background sync, deep
linking, navigation-state persistence, or protected payload persistence.
