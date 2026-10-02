# MOB-011 Role-Aware Navigation Foundation

MOB-011 adds a native role-aware navigation foundation without adding a routing
dependency. It is intentionally a presentation shell: Backend authorization,
MOB-010 access decisions, and MOB-009 session generation remain authoritative.

## Verified Role Source

Backend auth token responses identify the user/session but do not carry the
workspace persona. The verified workspace source is `GET /api/v1/me/workspaces`,
whose membership DTO exposes:

- `workspace.id`
- `membership.id`
- `membership.roles`

The verified membership role literals are:

- `GYM_OWNER`
- `GYM_MANAGER`
- `TRAINER`
- `ASSISTANT_TRAINER`
- `NUTRITIONIST`
- `TRAINEE`

Mobile V1 personas are only:

- `TRAINEE`
- `TRAINER`
- `ASSISTANT_TRAINER`
- `NUTRITIONIST`

`GYM_OWNER` and `GYM_MANAGER` are valid Backend membership literals, but they are
not silently converted into a Mobile V1 persona. Platform Admin and support
contexts are not Mobile gym personas.

## Role Is Not Authorization

The navigator uses role only to choose a persona shell and labels. It never
grants permission from role. There is no role-to-permission map. Examples:

- `TRAINER` does not prove assigned-trainee access.
- `ASSISTANT_TRAINER` does not inherit Trainer authorization locally.
- `NUTRITIONIST` does not grant nutrition commands.
- `TRAINEE` shell selection is not SELF authorization.

Protected destination seams must still consume MOB-010 access decisions and fail
closed while access is unresolved, unavailable, denied, malformed, or stale.
Backend remains the final authority when commands reach the server.

## Persona Selection

Persona selection requires a current MOB-009 auth generation and verified
workspace membership context. Missing or stale workspace context remains
unresolved. Malformed role data fails closed. Multiple supported Mobile personas
are ambiguous unless a later context-selection layer explicitly supplies a
verified preferred persona from the same membership roles.

MOB-011 does not implement workspace management or live workspace fetching. It
provides the seam that later stages can feed with verified `/me/workspaces`
data.

## Navigation State Safety

The shell identity is bound to:

- auth generation
- workspace ID
- membership ID
- selected persona

When any of those change, active route state resets to the persona default so
stale screens cannot remain visible after logout, account replacement, workspace
replacement, or persona replacement. Navigation state is not persisted and must
not contain access tokens, refresh tokens, Authorization headers, support session
IDs, signed URLs, or sensitive permission payloads.

## Auth Flow

Auth initialization renders no protected navigator. Unauthenticated,
MFA-required, and security-failure states remain in the auth flow. Authenticated
state still requires verified workspace/persona context before a persona shell is
shown.

## Scope Boundaries

MOB-011 does not implement:

- MOB-012 trainee product experience
- MOB-013 trainer/assistant workflows
- MOB-014 nutritionist workflows
- workouts, nutrition, progress, files, push, dashboards, or product API calls
- NetInfo, offline queues, support console, Platform Admin persona, or JWT
  decoding

No new navigation dependency is introduced.
