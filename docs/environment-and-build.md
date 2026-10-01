# Environment And Build Strategy

Mobile binaries are client software. Any code or value bundled into the app can be inspected by users. Environment strategy must make public client configuration convenient without confusing it with trusted secrets.

## Public Client Configuration

Expo exposes public client values through `EXPO_PUBLIC_*` variables. This repository centralizes those values in `src/config/publicConfig.ts`.

Current public values:

| Variable | Purpose | Secret? |
| --- | --- | --- |
| `EXPO_PUBLIC_APP_ENV` | Labels the client runtime as `local`, `development`, `staging`, or `production`. | No |
| `EXPO_PUBLIC_API_BASE_URL` | Base URL for the future standalone Backend API client. | No |

These values are allowed in `.env.example` because they are not credentials. Local `.env` files are ignored.

## Build-Time Configuration

Build-time settings are values Expo or a future EAS build profile needs to shape the binary, such as app display metadata, platform settings, and profile-specific public config.

Current V1 position:

- Keep static Expo metadata in `app.json`.
- Do not create native `ios/` or `android/` folders.
- Do not add EAS project IDs, bundle identifiers, signing credentials, or build profiles until a future issue requires them.
- If dynamic Expo config becomes necessary, introduce `app.config.ts` deliberately and keep credential reads out of client-facing config.

## Secret Model

Never put secrets in the mobile app bundle.

Examples that must not be committed or shipped in client config:

- Backend database URLs
- Backend private signing keys
- Service-account JSON
- Payment provider private keys
- Admin tokens
- Production credentials

Authorization must remain backend-authoritative. The app may hide or show UI based on role and permission data, but the Backend must enforce every privileged action.

## Backend Base URL Strategy

The future API client must read `publicClientConfig.backendBaseUrl` instead of hardcoding hostnames in call sites.

Development URL choices vary by runtime:

| Runtime | Typical local Backend URL |
| --- | --- |
| iOS simulator | `http://localhost:3000` |
| Android emulator | `http://10.0.2.2:3000` |
| Physical device | LAN-reachable machine IP, for example `http://192.168.1.10:3000` |
| Staging | A staging HTTPS Backend URL supplied by environment config |
| Production | A production HTTPS Backend URL supplied by environment config |

MOB-002 does not invent staging or production URLs and does not implement API calls.

## V1 Expo Build Model

| Mode | Intended use |
| --- | --- |
| Local development | `npm run start` with Expo Go while the app stays inside supported managed-workflow APIs. |
| Development build | Add only when native modules, custom dev client behavior, or Expo Go limitations require it. |
| Preview or staging | Future EAS profile using staging public config after identifiers and project setup are intentionally defined. |
| Production | Future EAS production build with production public config and store credentials managed outside the repository. |

MOB-002 does not submit builds, create signing credentials, create an EAS project, or define bundle identifiers.
