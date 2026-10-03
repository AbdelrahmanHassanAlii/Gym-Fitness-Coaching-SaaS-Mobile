# MOB-014 Nutritionist Experience

MOB-014 establishes the Mobile V1 Nutritionist persona experience on the locked auth, shared workspace context, access UX, and React Navigation foundations.

Mobile role is persona context only. It is not Backend authorization. The Backend remains authoritative for every relationship, dashboard, nutrition plan, and analytics request.

## Implemented Scope

- Nutritionist Home for a single verified active Nutritionist workspace context.
- Nutritionist relationship discovery using the shared coaching relationship list endpoint.
- Read-only relationship nutrition review after selecting a relationship from verified Backend relationship data.
- Read-only nutrition dashboard summary, nutrition plan list summary, and nutrition analytics summary.
- Disabled training mutation affordance that explains Nutritionist Mobile V1 does not provide training mutations.
- English and Arabic labels, RTL rendering, theme token styling, and native accessibility labels/states.

## Explicitly Deferred

- MOB-015 training/workout/PR authoring or execution.
- MOB-016 nutrition workflow mutations such as meal-plan authoring, food logging, target editing, or activation.
- MOB-017 progress/photo/check-in mutation flows.
- MOB-018 files/upload/presigned URL flows.
- MOB-019 push/device registration, notification settings, and unread counts.
- Offline queues, NetInfo policy, protected payload persistence, navigation state persistence, and deep linking.

## Backend Contract Matrix

| Mobile capability | Method/path | Backend protection | Mobile usage |
| --- | --- | --- | --- |
| Workspace/persona context | `GET /api/v1/me/workspaces` | Authenticated `/me` context | Shared generation-bound workspace source from MOB-012/013. Nutritionist is selected only when exactly one active membership has `NUTRITIONIST`. |
| Relationship discovery | `GET /api/v1/workspaces/:workspaceId/relationships` | `trainees.read` workspace access | Context discovery only. A returned relationship ID is not treated as specific dashboard authorization. |
| Relationship nutrition dashboard | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/dashboard` | Backend relationship access with `dashboard.relationship.read`; actor kind computed from active relationship assignment | Response is accepted only when workspace/relationship match and `actorKind === NUTRITIONIST` with nutrition visible. |
| Nutrition plan summaries | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/nutrition-plans?limit=10&includeArchived=false` | `nutrition.plans.read` plus Backend relationship access | Read-only first-page summary. Cursor is endpoint-specific and not generalized. |
| Nutrition analytics | `GET /api/v1/workspaces/:workspaceId/relationships/:relationshipId/analytics/nutrition` | Backend relationship access with `analytics.nutrition.read` | Read-only nutrition analytics summary with identity guard. |

## Access Boundaries

- `NUTRITIONIST` role can select the Nutritionist persona shell.
- `NUTRITIONIST` role cannot authorize any endpoint locally.
- Relationship list membership is not specific relationship authorization.
- Same-workspace membership, branch membership, or broad assigned-trainee facts are not used as specific relationship access proof.
- `actorKind` is response/context validation only.
- `relationshipId` always means coaching relationship ID, sourced from verified relationship discovery data.

## Race and Cache Boundaries

Query keys include the protected namespace, auth generation, workspace ID, membership ID, persona, relationship ID where material, and endpoint-specific discriminators. They never include credentials, refresh tokens, or support session IDs.

Late responses from a previous session, workspace, persona, or relationship cannot render under the current context because query identity changes with those context values. AbortSignal is passed to all MOB-014 Backend requests, but cancellation is not the only correctness mechanism.

## Security Debt

MOB-014 introduces no dependency changes. Existing dependency advisory debt remains separate and must not be remediated opportunistically in this stage.
