# Hassan Gym & Fitness Coaching Mobile

Expo React Native mobile application for the Hassan Gym & Fitness Coaching SaaS.

This repository is the standalone Mobile application. The Backend and Web applications remain separate repositories and are not required to run this bootstrap app.

## MOB-001 Scope

MOB-001 bootstraps the production foundation only:

- Expo managed application
- React Native with TypeScript
- Minimal root screen proving the app starts
- Basic repository scripts for bootstrap validation
- Initial Expo metadata and generated placeholder assets

MOB-001 intentionally does not implement product features, authentication, API clients, role-aware navigation, semantic theming, i18n/RTL infrastructure, secure storage, query caching, forms, or native Android/iOS projects.

## Baseline

Generated with `create-expo-app@5.0.0` using the `blank-typescript` template on 2026-10-01.

| Package | Version |
| --- | --- |
| Expo SDK | `57.0.0` line (`expo ~57.0.26`) |
| React Native | `0.86.3` |
| React | `19.2.3` |
| TypeScript | `~6.0.3` |

Expo's current SDK reference maps Expo SDK 57 to React Native 0.86, React 19.2.3, and Node 22.13.x or newer.

## Prerequisites

- Node.js `22.13.x` or newer
- npm
- Expo-compatible Android/iOS tooling only when running on native devices or simulators

The local MOB-001 validation used Node `v24.4.0` and npm `9.9.4`.

## Package Manager

Use npm for this repository.

The committed lockfile is `package-lock.json`. Do not add Bun, pnpm, Yarn, or additional lockfiles unless a future issue deliberately changes the package manager.

## Install

```bash
npm install
```

## Development

```bash
npm run start
```

Android development server command:

```bash
npm run android
```

iOS development server command:

```bash
npm run ios
```

iOS simulator/runtime validation requires macOS and Xcode. On other platforms, use a compatible Expo workflow or physical device when available.


## Validation Commands

```bash
npm run typecheck
npm run lint
npm run doctor
npm run smoke
npm run test
```

`npm run test` is a MOB-001 placeholder smoke command. The real test foundation belongs to MOB-005.

## Repository Boundaries

- Backend: `Gym-Fitness-Coaching-SaaS-Backend`
- Web: `Gym-Fitness-Coaching-SaaS-Web`
- Mobile: this repository

MOB-001 does not integrate with Backend runtime behavior and does not modify Backend or Web.