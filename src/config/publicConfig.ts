declare const process: {
  env: {
    EXPO_PUBLIC_API_BASE_URL?: string;
    EXPO_PUBLIC_APP_ENV?: string;
  };
};

const appEnvironments = ['local', 'development', 'staging', 'production'] as const;

export type AppEnvironment = (typeof appEnvironments)[number];

export type PublicClientConfig = Readonly<{
  appEnvironment: AppEnvironment;
  backendBaseUrl: string | null;
}>;

type PublicClientConfigEnv = {
  EXPO_PUBLIC_API_BASE_URL?: string;
  EXPO_PUBLIC_APP_ENV?: string;
};

function readAppEnvironment(value: string | undefined): AppEnvironment {
  if (appEnvironments.includes(value as AppEnvironment)) {
    return value as AppEnvironment;
  }

  return 'local';
}

function readOptionalUrl(value: string | undefined): string | null {
  const trimmedValue = value?.trim();

  if (!trimmedValue) {
    return null;
  }

  return trimmedValue;
}

export function createPublicClientConfig(
  env: PublicClientConfigEnv,
): PublicClientConfig {
  return Object.freeze({
    appEnvironment: readAppEnvironment(env.EXPO_PUBLIC_APP_ENV),
    backendBaseUrl: readOptionalUrl(env.EXPO_PUBLIC_API_BASE_URL),
  });
}

export const publicClientConfig = createPublicClientConfig(process.env);
