# Npm Audit Follow-Up

MOB-005 re-evaluated the MOB-001 audit findings after installing the testing foundation.

## Current Result

`npm audit --json` still reports 10 moderate findings:

- `expo` direct package, via Expo tooling dependencies;
- transitive `@expo/cli`;
- transitive `@expo/config`;
- transitive `@expo/config-plugins`;
- transitive `@expo/inline-modules`;
- transitive `@expo/local-build-cache-provider`;
- transitive `@expo/metro-config`;
- transitive `@expo/prebuild-config`;
- transitive `xcode`;
- transitive `uuid` through `xcode`.

## Compatibility Assessment

The compatible Expo SDK 57 checks pass:

- `expo-doctor`: 21/21 checks passed;
- `expo install --check`: dependencies are up to date.

npm reports a fix path through `expo@46.0.21`, which would be an incompatible downgrade from Expo SDK 57 and is not acceptable for this app.

## Runtime And Build Threat Model

The findings are in Expo CLI/config/prebuild/build-time tooling and `xcode` parsing support, not in app product runtime code. They matter for developer and CI environments that process project configuration or native prebuild inputs. They do not currently indicate an exploitable issue in shipped JavaScript product behavior.

Track this as compatible-upstream debt until Expo publishes an SDK 57-compatible fix path or a later approved SDK upgrade resolves it.
