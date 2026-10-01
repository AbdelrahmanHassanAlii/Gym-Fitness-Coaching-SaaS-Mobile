# Mobile Testing Foundation

MOB-005 establishes the initial quality gates for the Expo mobile app without adding product behavior.

## Local Quality Gates

Run these before opening a mobile pull request:

```bash
npm run lint
npm run typecheck
npm run test
npm run doctor
npm run deps:check
npm run export:ci
```

`npm run test` is a real Jest command. It uses `jest-expo` for the Expo SDK 57 / React Native 0.86 runtime and React Native Testing Library for component rendering.

## Unit And Component Tests

- Put colocated or app-level tests under `__tests__` using `*.test.ts` or `*.test.tsx`.
- Prefer pure TypeScript unit tests for formatting, validation, mapping, and other logic that does not need a React Native tree.
- Prefer React Native Testing Library for components. Query by user-visible text, role, label, placeholder, display value, or hint before falling back to test IDs.
- Do not invent product features to create test coverage. Add tests around behavior introduced by the issue that owns that behavior.

## Integration Tests

Integration tests should compose real app providers and mocked external boundaries after MOB-002 introduces architecture and environment seams. Keep network, storage, permissions, notifications, and native modules behind replaceable adapters so integration tests can run in Node without Android or iOS emulators.

## Accessibility Tests

Component tests should exercise React Native accessibility props through Testing Library queries:

- use `getByRole` for semantic controls and headings;
- use `getByLabelText` when visual text is not the accessible name;
- assert disabled, selected, expanded, checked, and busy states through accessible state where relevant;
- reserve `testID` for cases where no user-facing query exists.

Automated component tests do not replace manual/device accessibility review with TalkBack, VoiceOver, font scaling, contrast review, keyboard/switch navigation, and platform-specific focus behavior.

## Device And E2E Strategy

MOB-005 does not add a required local E2E command because this Windows checkout does not guarantee Android/iOS emulator availability and the app has no product workflow to automate yet.

Future E2E should use Maestro first for Expo-compatible black-box flows once navigation and product screens exist. Detox can be reconsidered only if future native build requirements justify its heavier simulator/device setup. Device E2E must be reported separately from Jest results and must not be claimed unless it actually ran on an emulator, simulator, or physical device.

## Npm Audit Policy

Audit findings in Expo-managed transitive dependencies are tracked as compatible-upstream debt when Expo doctor and `expo install --check` pass and no compatible SDK-line upgrade is available. Do not force an Expo downgrade or unsupported dependency override solely to make `npm audit` green.
