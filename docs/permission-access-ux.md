# MOB-010 Permission And Access UX

MOB-010 adds Mobile-side access presentation primitives. It does not replace
Backend authorization. Backend remains the only trusted authority for every
privileged API command; Mobile checks are UX affordances for hiding, disabling,
or explaining controls after verified access facts are available.

## Verified Backend Contract

Verified Backend evidence:

- `/api/v1/me` returns user and session facts, including
  `restrictedUntilVerified` and `mfaSatisfied`.
- `/api/v1/me/workspaces` returns active workspace memberships.
- Permission identifiers come from Backend `Permissions` registry.
- Workspace effective access can expose decisions with `permission`, `effect`,
  `allowed`, `source`, explicit deny flags, and profile/grant provenance.
- Stage 4 access resolution gives `DENY` precedence over `ALLOW`.
- Workspace query access can include workspace-wide, assigned trainee, self,
  branch, and relationship-specific facts.
- Support/platform contexts exist in Backend, but Mobile V1 does not expose a
  support console or Platform Admin surface.

Mobile models only a verified subset of permission identifiers that are relevant
to V1 Mobile roles. Unknown identifiers fail closed instead of becoming local
feature flags.

MOB-010 does not fetch live permission data yet. `AccessProvider` holds
already-verified access facts supplied by future feature/query layers and binds
them to the current auth generation for presentation. MOB-007 owns transport,
MOB-008 owns query primitives, and future product work owns endpoint-specific
loading.

## Role Versus Permission

Roles are identity and future navigation context. They are not authorization.
MOB-010 intentionally does not provide a role-to-permission map such as
`TRAINER -> workouts.read`. A role can be displayed or passed along as context
for MOB-011, but access decisions require verified Backend permission facts.

Platform Admin is not treated as a gym role. Gym owner/manager roles are not V1
Mobile product surfaces unless future issues add a verified Mobile requirement.

## Access State Model

The Mobile access decision states are:

- `unresolved`: access facts are not loaded or belong to a stale generation.
- `allowed`: verified Backend facts allow the permission in the requested
  context.
- `denied`: Backend facts or a Backend 403 deny access.
- `unavailable`: access could not be verified because facts are malformed,
  unsupported, unknown, or failed to load.

Unresolved, unavailable, and malformed states are never allow. Destructive UI
must fail closed. Denied and unauthenticated remain distinct; an ordinary 403
does not log out the user.

## Context And Race Boundaries

Access facts bind to the current MOB-009 auth generation. A late response from
account/session A cannot overwrite account/session B because stale generations
resolve to `unresolved`, not `allowed`.

Workspace, branch, and relationship context is explicit:

- Workspace A facts do not satisfy Workspace B.
- Branch access is not inferred from workspace permission unless verified
  Backend facts explicitly identify that branch/context as available.
- Relationship access is not inferred from trainer, assistant trainer,
  nutritionist role, or broad assigned-trainee/self flags for a specific
  relationship. A relationship-specific action needs explicit relationship
  access facts.
- Scoped `DENY` facts only deny the context they apply to. A Branch A deny does
  not deny Branch B, and a Relationship A deny does not deny Relationship B.
- Opaque relationship IDs remain coaching relationship IDs.

MOB-010 uses MOB-008/MOB-009 protected query conventions. Query keys must never
include access tokens, refresh tokens, authorization headers, signed URLs, or
secrets.

## 403 And Offline Limitations

Preloaded permission state can drift. If Backend returns 403, Mobile should show
access-denied UX, preserve the auth session, and avoid generic mutation retry.
Application layers may reload access facts when useful, but Backend remains the
source of truth.

MOB-010 does not add NetInfo, an offline permission cache policy, or an offline
mutation queue. Cached access facts improve UX only; they are not durable
authorization.

## MOB-011 Boundary

MOB-010 does not build role-aware navigation, tabs, stacks, or role-specific
workflows. MOB-011 may consume role context and access primitives later, but it
must keep role context separate from Backend-authoritative permission facts.
