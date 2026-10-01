import { describe, expect, it, jest, beforeEach, afterEach } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { render } from '@testing-library/react-native';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import * as SecureStore from 'expo-secure-store';
import { createElement } from 'react';

import { ApiClientError, type ApiClient } from '@/api';
import type { ApiTimestamp, IanaTimezone, RelationshipId } from '@/contracts';
import {
  createHalfOpenDateOnlyRange,
  formatInstant,
  isValidExplicitOffsetTimestamp,
  parseDateOnly,
  preserveDateOnly,
} from '@/datetime';
import { createFormConfig, preserveBackendValidationDetails } from '@/forms';
import { AppInfrastructureProvider } from '@/providers';
import {
  appQueryClient,
  appQueryKey,
  clearProtectedQueryCache,
  createApiQueryFn,
  createAppQueryClient,
  createInfinitePagination,
  preserveOpaqueCursor,
  shouldRetryQuery,
} from '@/query';
import {
  secureStorage,
  sensitiveStorageKeys,
} from '@/storage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const secureStoreMock = SecureStore as jest.Mocked<typeof SecureStore>;
const createdQueryClients: QueryClient[] = [];

function createTrackedQueryClient(): QueryClient {
  const queryClient = createAppQueryClient();
  createdQueryClients.push(queryClient);
  return queryClient;
}

afterEach(() => {
  appQueryClient.clear();
  for (const queryClient of createdQueryClients) {
    queryClient.clear();
  }
  createdQueryClients.length = 0;
});

describe('secure storage infrastructure', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('delegates write, read, and delete to SecureStore with a stable safe namespace', async () => {
    secureStoreMock.getItemAsync.mockResolvedValue('stored-sensitive-value');

    await secureStorage.write(sensitiveStorageKeys.nativeRefreshToken, 'sensitive-value');
    await expect(secureStorage.read(sensitiveStorageKeys.nativeRefreshToken)).resolves.toBe(
      'stored-sensitive-value',
    );
    await secureStorage.delete(sensitiveStorageKeys.nativeRefreshToken);

    expect(sensitiveStorageKeys.nativeRefreshToken).toBe(
      'hassan.mobile.secure.auth.native-refresh-token',
    );
    expect(sensitiveStorageKeys.nativeRefreshToken).not.toContain('sensitive-value');
    expect(secureStoreMock.setItemAsync).toHaveBeenCalledWith(
      sensitiveStorageKeys.nativeRefreshToken,
      'sensitive-value',
    );
    expect(secureStoreMock.getItemAsync).toHaveBeenCalledWith(
      sensitiveStorageKeys.nativeRefreshToken,
    );
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(
      sensitiveStorageKeys.nativeRefreshToken,
    );
  });

  it('propagates SecureStore failures without falling back to AsyncStorage', async () => {
    secureStoreMock.setItemAsync.mockRejectedValueOnce(new Error('write failed'));
    secureStoreMock.getItemAsync.mockRejectedValueOnce(new Error('read failed'));
    secureStoreMock.deleteItemAsync.mockRejectedValueOnce(new Error('delete failed'));
    const asyncStorageSetSpy = jest.spyOn(AsyncStorage, 'setItem');
    const asyncStorageGetSpy = jest.spyOn(AsyncStorage, 'getItem');
    const asyncStorageRemoveSpy = jest.spyOn(AsyncStorage, 'removeItem');

    await expect(
      secureStorage.write(sensitiveStorageKeys.nativeRefreshToken, 'future-refresh-token'),
    ).rejects.toMatchObject({
      operation: 'write',
      key: sensitiveStorageKeys.nativeRefreshToken,
    });
    await expect(secureStorage.read(sensitiveStorageKeys.nativeRefreshToken)).rejects.toMatchObject({
      operation: 'read',
    });
    await expect(
      secureStorage.delete(sensitiveStorageKeys.nativeRefreshToken),
    ).rejects.toMatchObject({
      operation: 'delete',
    });

    expect(asyncStorageSetSpy).not.toHaveBeenCalled();
    expect(asyncStorageGetSpy).not.toHaveBeenCalled();
    expect(asyncStorageRemoveSpy).not.toHaveBeenCalled();
  });

  it('distinguishes missing values from SecureStore read failures', async () => {
    secureStoreMock.getItemAsync.mockResolvedValueOnce(null);

    await expect(secureStorage.read(sensitiveStorageKeys.nativeRefreshToken)).resolves.toBeNull();
  });

  it('does not log sensitive values during normal secure writes', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    await secureStorage.write(sensitiveStorageKeys.nativeRefreshToken, 'never-log-this');

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not include sensitive values in SecureStorageError messages', async () => {
    secureStoreMock.setItemAsync.mockRejectedValueOnce(new Error('native write failed'));

    await expect(
      secureStorage.write(sensitiveStorageKeys.nativeRefreshToken, 'secret-refresh-value'),
    ).rejects.toMatchObject({
      message: 'Secure storage write failed.',
    });
  });
});

describe('query infrastructure', () => {
  it('keeps the same application QueryClient across provider rerenders', async () => {
    const seenClients: QueryClient[] = [];

    function Probe() {
      seenClients.push(useQueryClient());
      return null;
    }

    const rendered = await render(
      createElement(AppInfrastructureProvider, null, createElement(Probe)),
    );

    await rendered.rerender(
      createElement(AppInfrastructureProvider, null, createElement(Probe)),
    );

    expect(seenClients).toHaveLength(2);
    expect(seenClients[0]).toBe(seenClients[1]);
  });

  it('owns a stable QueryClient with disabled mutation retries', () => {
    const firstQueryClient = createTrackedQueryClient();
    const secondQueryClient = createTrackedQueryClient();

    expect(appQueryClient).toBe(appQueryClient);
    expect(firstQueryClient).toBeInstanceOf(QueryClient);
    expect(secondQueryClient.getDefaultOptions().mutations?.retry).toBe(false);
  });

  it('bounds query retries and does not retry 4xx or 409 conflicts', () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';

    expect(shouldRetryQuery(0, new TypeError('offline'))).toBe(true);
    expect(shouldRetryQuery(0, abortError)).toBe(false);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'network',
          source: 'network',
          message: 'offline',
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'expected_version_conflict',
          source: 'backend',
          message: 'conflict',
          status: 409,
        }),
      ),
    ).toBe(false);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'malformed_response',
          source: 'transport',
          message: 'bad json',
        }),
      ),
    ).toBe(false);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'authentication',
          source: 'backend',
          message: 'auth',
          status: 401,
        }),
      ),
    ).toBe(false);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'http',
          source: 'backend',
          message: 'unavailable',
          status: 503,
        }),
      ),
    ).toBe(true);
    expect(
      shouldRetryQuery(
        0,
        new ApiClientError({
          kind: 'http',
          source: 'backend',
          message: 'bad gateway',
          status: 502,
        }),
      ),
    ).toBe(true);
    expect(shouldRetryQuery(2, new TypeError('offline'))).toBe(false);
  });

  it('creates deterministic query keys and rejects sensitive key fields', () => {
    const relationshipId = 'relationship-1' as RelationshipId;

    expect(
      appQueryKey({
        scope: 'session',
        entity: 'relationship-dashboard',
        role: 'TRAINER',
        relationshipId,
        filters: { to: '2026-10-08', from: '2026-10-01', omitted: undefined },
      }),
    ).toEqual([
      'session',
      'relationship-dashboard',
      {
        role: 'TRAINER',
        relationshipId,
        filters: { from: '2026-10-01', to: '2026-10-08' },
        page: undefined,
      },
    ]);

    expect(() =>
      appQueryKey({
        scope: 'session',
        entity: 'unsafe',
        filters: { refreshToken: 'secret' },
      }),
    ).toThrow('may contain sensitive data');
    expect(() =>
      appQueryKey({
        scope: 'session',
        entity: 'unsafe',
        filters: {
          nested: [{ Authorization: 'Bearer secret' }] as never,
        },
      }),
    ).toThrow('may contain sensitive data');
  });

  it('clears protected session cache without clearing public cache', () => {
    const queryClient = createTrackedQueryClient();
    queryClient.setQueryData(['session', 'viewer'], { id: 'user-1' });
    queryClient.setQueryData(['public', 'config'], { ok: true });

    clearProtectedQueryCache(queryClient);

    expect(queryClient.getQueryData(['session', 'viewer'])).toBeUndefined();
    expect(queryClient.getQueryData(['public', 'config'])).toEqual({ ok: true });
  });

  it('passes TanStack Query AbortSignal through to the MOB-007 transport seam', async () => {
    const controller = new AbortController();
    const requestCalls: unknown[] = [];
    const apiClient: ApiClient = {
      async request<TResponse>(options: Parameters<ApiClient['request']>[0]) {
        requestCalls.push(options);
        return { data: true } as TResponse;
      },
    };
    const queryClient = createTrackedQueryClient();
    const queryFn = createApiQueryFn(apiClient, () => ({
      method: 'GET',
      path: '/me',
    }));

    await expect(
      queryFn({
        queryKey: ['session', 'me'],
        signal: controller.signal,
        meta: undefined,
        client: queryClient,
      }),
    ).resolves.toEqual({ data: true });

    expect(requestCalls).toEqual([{
      method: 'GET',
      path: '/me',
      signal: controller.signal,
    }]);
  });

  it('allows multiple pagination shapes and preserves opaque cursors', () => {
    const cursorPagination = createInfinitePagination({
      getNextPageParam: (page: { page: { nextCursor?: string | null } }) =>
        page.page.nextCursor,
    });
    const pagePagination = createInfinitePagination({
      getNextPageParam: (page: { nextPage?: number }) => page.nextPage,
    });

    expect(cursorPagination.getNextPageParam({ page: { nextCursor: 'opaque:/+=' } })).toBe(
      'opaque:/+=',
    );
    expect(pagePagination.getNextPageParam({ nextPage: 3 })).toBe(3);
    expect(preserveOpaqueCursor('opaque:/+=')).toBe('opaque:/+=');
  });
});

describe('form infrastructure', () => {
  it('provides form defaults without endpoint-specific schemas', () => {
    expect(createFormConfig({ defaultValues: { name: '' } })).toMatchObject({
      mode: 'onSubmit',
      reValidateMode: 'onChange',
      defaultValues: { name: '' },
    });
  });

  it('preserves backend validation details without inventing field-path semantics', () => {
    const details = {
      issues: [{ path: ['email'], message: 'Invalid email' }],
      global: ['Request is invalid'],
    };

    expect(preserveBackendValidationDetails(details)).toBe(details);
    expect(preserveBackendValidationDetails(undefined)).toBeNull();
  });
});

describe('date and time infrastructure', () => {
  it.each(['2026-01-01', '2024-02-29', '2026-12-31'])(
    'preserves valid DateOnly %s without converting to an instant',
    (value) => {
      const dateOnly = parseDateOnly(value);

      expect(dateOnly).toBe(value);
      expect(preserveDateOnly(dateOnly)).toBe(dateOnly);
      expect(new Date(dateOnly).toISOString()).not.toBe(dateOnly);
    },
  );

  it.each([
    '2026-02-29',
    '2026-00-10',
    '2026-13-01',
    '2026-04-31',
    '2026-1-01',
    '01-01-2026',
    '',
    '2026-10-01T00:00:00Z',
  ])('rejects invalid DateOnly %s', (value) => {
    expect(() => parseDateOnly(value)).toThrow('YYYY-MM-DD');
  });

  it('preserves exclusive to in [from,to) DateOnly ranges', () => {
    const from = parseDateOnly('2026-10-01');
    const to = parseDateOnly('2026-10-08');

    expect(createHalfOpenDateOnlyRange(from, to)).toEqual({ from, to });
    expect(() => createHalfOpenDateOnlyRange(to, from)).toThrow('[from,to)');
  });

  it('formats instants only with explicit locale and timezone', () => {
    const timestamp = '2026-10-01T12:00:00Z' as ApiTimestamp;
    const timezone = 'Africa/Cairo' as IanaTimezone;

    expect(formatInstant(timestamp, { locale: 'en', timeZone: timezone })).toEqual(
      expect.any(String),
    );
    expect(() =>
      formatInstant('2026-10-01T12:00:00' as ApiTimestamp, {
        locale: 'en',
        timeZone: timezone,
      }),
    ).toThrow('explicit offset');
    expect(() =>
      formatInstant(timestamp, {
        locale: 'en',
        timeZone: 'Mars/Base' as IanaTimezone,
      }),
    ).toThrow('IANA timezone');
  });

  it.each([
    ['2026-10-01T12:00:00Z', true],
    ['2026-10-01T12:00:00+02:00', true],
    ['2026-10-01T12:00:00-05:00', true],
    ['2026-10-01T12:00:00.123Z', true],
    ['2026-10-01T12:00:00', false],
    ['2026-10-01', false],
    ['garbage', false],
    ['2026-02-29T12:00:00Z', false],
    ['2026-10-01T25:00:00Z', false],
  ])('validates explicit offset timestamp %s', (value, expected) => {
    expect(isValidExplicitOffsetTimestamp(value)).toBe(expected);
  });

  it('uses explicit business timezone for DST-sensitive instant formatting', () => {
    const beforeDstJump = '2026-03-08T06:30:00Z' as ApiTimestamp;
    const afterDstJump = '2026-03-08T07:30:00Z' as ApiTimestamp;

    expect(
      formatInstant(beforeDstJump, {
        locale: 'en-US',
        timeZone: 'America/New_York' as IanaTimezone,
        dateStyle: undefined,
        timeStyle: 'short',
      }),
    ).toContain('1:30');
    expect(
      formatInstant(afterDstJump, {
        locale: 'en-US',
        timeZone: 'America/New_York' as IanaTimezone,
        dateStyle: undefined,
        timeStyle: 'short',
      }),
    ).toContain('3:30');
    expect(
      formatInstant(afterDstJump, {
        locale: 'en-US',
        timeZone: 'Africa/Cairo' as IanaTimezone,
        dateStyle: undefined,
        timeStyle: 'short',
      }),
    ).toContain('9:30');
    expect(
      formatInstant(afterDstJump, {
        locale: 'en-US',
        timeZone: 'UTC' as IanaTimezone,
        dateStyle: undefined,
        timeStyle: 'short',
      }),
    ).toContain('7:30');
  });

  it('keeps DateOnly business ranges separate from fixed +24h assumptions', () => {
    const from = parseDateOnly('2026-03-27');
    const to = parseDateOnly('2026-03-28');

    expect(createHalfOpenDateOnlyRange(from, to).to).toBe('2026-03-28');
  });
});
