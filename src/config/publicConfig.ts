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

export const publicClientConfig: PublicClientConfig = Object.freeze({
  appEnvironment: readAppEnvironment(process.env.EXPO_PUBLIC_APP_ENV),
  backendBaseUrl: readOptionalUrl(process.env.EXPO_PUBLIC_API_BASE_URL),
});
