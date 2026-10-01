import { describe, expect, it } from '@jest/globals';

import { createPublicClientConfig } from '../src/config/publicConfig';

describe('publicClientConfig', () => {
  it('defaults to local with no backend URL', () => {
    expect(createPublicClientConfig({})).toEqual({
      appEnvironment: 'local',
      backendBaseUrl: null,
    });
  });

  it('accepts known public environment values and trims backend URL', () => {
    expect(
      createPublicClientConfig({
        EXPO_PUBLIC_APP_ENV: 'staging',
        EXPO_PUBLIC_API_BASE_URL: ' https://api.example.test ',
      }),
    ).toEqual({
      appEnvironment: 'staging',
      backendBaseUrl: 'https://api.example.test',
    });
  });

  it('falls back to local for unknown app environment labels', () => {
    const publicClientConfig = createPublicClientConfig({
      EXPO_PUBLIC_APP_ENV: 'qa',
    });

    expect(publicClientConfig.appEnvironment).toBe('local');
  });
});
