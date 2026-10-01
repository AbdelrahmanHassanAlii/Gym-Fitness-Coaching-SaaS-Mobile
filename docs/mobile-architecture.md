# Mobile Architecture

MOB-002 defines the first architecture conventions for the standalone Expo mobile app. It does not implement product features, role-aware navigation, auth, permissions, API calls, theme tokens, i18n, storage, forms, query caching, contracts, or a testing stack.

## Product Shape

Mobile is one role-aware client application for:

- Trainees
- Trainers
- Assistant trainers
- Nutritionists

Role behavior must be driven by authenticated backend state and backend-authoritative authorization. The app can adapt its interface after receiving role and permission data, but shipped client code is not a trusted enforcement point.

## Module Ownership

Use `src/` for application code. Add folders when real code arrives; do not create placeholder trees.

| Area | Future location | Owner convention |
| --- | --- | --- |
| App shell and providers | `src/app/` | Cross-cutting composition only. Keep product decisions in feature modules. |
| Screens and routes | `src/navigation/` and feature-owned screen files | MOB-011 owns role-aware navigation, stack shape, tabs, and routing gates. |
| Features and domains | `src/features/<domain>/` | Product behavior lives with its domain. Prefer deep modules with small interfaces. |
| Shared UI | `src/ui/` | Reusable presentational modules only. MOB-003 owns theme tokens and design primitives. |
| Infrastructure | `src/infrastructure/` | Adapters for device, network, logging, persistence, and runtime integrations. |
| API access | `src/api/` | MOB-007 owns the API client. It should consume config from `src/config`, not read env everywhere. |
| Auth | `src/auth/` or feature-owned auth modules | MOB-009 owns auth state, token lifecycle, and secure storage usage. |
| Permissions | `src/permissions/` | MOB-010 owns permission modeling and client-side affordances. Backend remains authoritative. |
| Configuration | `src/config/` | Public client config and build profile seams. No credentials. |
| Hooks | Feature-owned first; `src/hooks/` only for cross-cutting hooks | Avoid a global dumping ground. |
| Utilities | Feature-owned first; `src/utils/` only for stable cross-cutting helpers | Keep utility interfaces narrow and well named. |
| Types and contracts | Feature-owned first; future generated/shared contracts under `src/contracts/` | MOB-006 owns contract strategy. |
| Assets | `assets/` for Expo metadata assets; future runtime assets may move under `src/assets/` when imported by modules | Keep platform metadata assets stable for Expo config. |

## Navigation Boundary

MOB-002 only reserves the navigation seam. Future navigation should live under `src/navigation/` and compose feature-owned screens. MOB-011 owns:

- Auth stacks
- Role tabs
- Trainee, trainer, assistant trainer, and nutritionist stacks
- Permission-aware routing
- Deep linking decisions

Until MOB-011 lands, the root `App.tsx` should stay a simple bootstrap screen.

## Import Conventions

Use the single `@/*` alias for imports from `src/*`.

Examples:

```ts
import { publicClientConfig } from '@/config/publicConfig';
```

Avoid adding aliases for each folder. Relative imports are still fine for nearby files inside the same module.

## Module Design

Prefer deep modules: keep interfaces small and put complexity behind clear seams. Do not add a seam just because one adapter exists. A future API client, secure storage adapter, or permissions evaluator earns a seam when callers would otherwise duplicate environment, platform, or policy knowledge.
