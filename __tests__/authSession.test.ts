import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from '@tanstack/react-query';

import {
  ApiClientError,
  createApiClient,
  type ApiClient,
  type ApiRequestOptions,
} from '@/api';
import { AuthSessionController } from '@/auth';
import type { AuthTokenResponseDto, LoginResponseDto } from '@/contracts';
import { protectedQueryScope } from '@/query';
import {
  sensitiveStorageKeys,
  type SensitiveStorageKey,
  type SensitiveValueStore,
} from '@/storage';

const jsonHeaders = { 'content-type': 'application/json' };
const queryClients: QueryClient[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { ...jsonHeaders, ...(init.headers as Record<string, string> | undefined) },
  });
}

function backendError(status: number, code: string): Response {
  return jsonResponse({ error: { code, message: code, correlationId: 'c' } }, { status });
}

function authEnvelope(accessToken: string, refreshToken: string): AuthTokenResponseDto {
  return {
    data: {
      accessToken,
      refreshToken,
      restrictedUntilVerified: false,
      user: {
        id: 'user-1' as never,
        firstName: 'Hassan',
        lastName: 'Coach',
        emailVerified: true,
        phoneVerified: false,
      },
    },
  };
}

function loginEnvelope(accessToken: string, refreshToken: string): LoginResponseDto {
  return authEnvelope(accessToken, refreshToken);
}

function mfaEnvelope(): LoginResponseDto {
  return {
    data: {
      status: 'MFA_REQUIRED',
      mfaChallengeToken: 'challenge-token',
      availableMethods: ['TOTP'],
    },
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

class MemoryCredentialStore implements SensitiveValueStore {
  value: string | null;
  writes: string[] = [];
  deletes = 0;
  readError: unknown;
  writeError: unknown;
  deleteError: unknown;
  writeSideEffectBeforeThrow = false;
  deleteSideEffectBeforeThrow = false;
  writeDeferrals: ReturnType<typeof deferred<void>>[] = [];
  deleteDeferrals: ReturnType<typeof deferred<void>>[] = [];

  constructor(value: string | null = null) {
    this.value = value;
  }

  async read(_key: SensitiveStorageKey): Promise<string | null> {
    if (this.readError) throw this.readError;
    return this.value;
  }

  async write(_key: SensitiveStorageKey, value: string): Promise<void> {
    this.writes.push(value);
    const pending = this.writeDeferrals.shift();
    if (pending) await pending.promise;
    if (this.writeSideEffectBeforeThrow) this.value = value;
    if (this.writeError) throw this.writeError;
    this.value = value;
  }

  async delete(_key: SensitiveStorageKey): Promise<void> {
    this.deletes += 1;
    const pending = this.deleteDeferrals.shift();
    if (pending) await pending.promise;
    if (this.deleteSideEffectBeforeThrow) this.value = null;
    if (this.deleteError) throw this.deleteError;
    this.value = null;
  }
}

function createQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  });
  queryClients.push(queryClient);
  return queryClient;
}

function createApiStub(responses: unknown[]): { apiClient: ApiClient; calls: ApiRequestOptions<never, never>[] } {
  const calls: ApiRequestOptions<never, never>[] = [];
  const apiClient: ApiClient = {
    async request<TResponse>(options: ApiRequestOptions<never, never>): Promise<TResponse> {
      calls.push(options);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return await (next as () => Promise<TResponse>)();
      return next as TResponse;
    },
  };

  return { apiClient, calls };
}

describe('auth session lifecycle', () => {
  afterEach(() => {
    for (const queryClient of queryClients) {
      queryClient.clear();
    }
    queryClients.length = 0;
  });

  it('starts initializing and becomes unauthenticated when no refresh token is stored', async () => {
    const controller = new AuthSessionController({
      apiClient: createApiStub([]).apiClient,
      credentialStore: new MemoryCredentialStore(null),
      queryClient: createQueryClient(),
    });

    expect(controller.getState().status).toBe('initializing');
    await controller.initialize();
    expect(controller.getState().status).toBe('unauthenticated');
  });

  it('distinguishes SecureStore read failure from missing credentials', async () => {
    const store = new MemoryCredentialStore(null);
    store.readError = new Error('native read failed');
    const controller = new AuthSessionController({
      apiClient: createApiStub([]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await expect(controller.initialize()).rejects.toMatchObject({
      reason: 'secure_storage_read_failed',
    });
    expect(controller.getState().status).toBe('security_failure');
  });

  it('cold bootstraps by refreshing once, persisting R2, and committing access token in memory', async () => {
    const store = new MemoryCredentialStore('refresh-R1');
    const { apiClient, calls } = createApiStub([authEnvelope('access-B', 'refresh-R2')]);
    const controller = new AuthSessionController({
      apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await controller.initialize();

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      method: 'POST',
      path: '/auth/refresh',
      body: { clientType: 'MOBILE', refreshToken: 'refresh-R1' },
      accessToken: null,
    });
    expect(store.value).toBe('refresh-R2');
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
    expect(controller.getState().status).toBe('authenticated');
  });

  it('does not leave a healthy authenticated state when bootstrap R2 persistence fails', async () => {
    const store = new MemoryCredentialStore('refresh-R1');
    store.writeError = new Error('secure write failed');
    const controller = new AuthSessionController({
      apiClient: createApiStub([authEnvelope('access-B', 'refresh-R2')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await expect(controller.initialize()).rejects.toMatchObject({
      reason: 'secure_storage_write_failed',
    });
    expect(controller.getState().status).toBe('security_failure');
    expect(controller.authSeam.getAccessToken()).toBeNull();
  });

  it('logs in only after the refresh token is securely persisted', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-login', 'refresh-login')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    expect(store.value).toBe('refresh-login');
    expect(controller.authSeam.getAccessToken()).toBe('access-login');
    expect(controller.getState().status).toBe('authenticated');
  });

  it('surfaces MFA-required login without storing credentials', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([mfaEnvelope()]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    expect(controller.getState()).toMatchObject({ status: 'mfa_required' });
    expect(store.writes).toHaveLength(0);
  });

  it('completes MFA through the same secure credential commit path', async () => {
    const store = new MemoryCredentialStore(null);
    const { apiClient, calls } = createApiStub([authEnvelope('access-mfa', 'refresh-mfa')]);
    const controller = new AuthSessionController({
      apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await controller.completeMfaLogin({
      mfaChallengeToken: 'challenge',
      factorType: 'TOTP',
      credential: '123456',
    });

    expect(calls[0]).toMatchObject({ path: '/auth/mfa/login/verify', accessToken: null });
    expect(store.value).toBe('refresh-mfa');
    expect(controller.getState().status).toBe('authenticated');
  });

  it('does not fall back to AsyncStorage or persist access tokens on login write failure', async () => {
    const store = new MemoryCredentialStore(null);
    store.writeError = new Error('write failed');
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-login', 'refresh-login')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await expect(
      controller.login({ identifier: 'coach@example.com', password: 'password' }),
    ).rejects.toMatchObject({ reason: 'secure_storage_write_failed' });
    expect(controller.authSeam.getAccessToken()).toBeNull();
    expect(store.value).toBeNull();
  });

  it('logs out by clearing memory, storage, and protected query cache', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([protectedQueryScope, 'me'], { id: 'old' });
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-login', 'refresh-login'),
        { data: { success: true } },
      ]).apiClient,
      credentialStore: store,
      queryClient,
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    await controller.logout();

    expect(controller.getState().status).toBe('unauthenticated');
    expect(controller.authSeam.getAccessToken()).toBeNull();
    expect(store.value).toBeNull();
    expect(queryClient.getQueryData([protectedQueryScope, 'me'])).toBeUndefined();
  });

  it('surfaces SecureStore delete failure on logout without claiming deletion', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-login', 'refresh-login'),
        { data: { success: true } },
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });
    store.deleteError = new Error('delete failed');

    await expect(controller.logout()).rejects.toMatchObject({
      reason: 'secure_storage_delete_failed',
    });
    expect(controller.getState().status).toBe('security_failure');
  });

  it('allows local unauthenticated state when server logout fails after local deletion', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-login', 'refresh-login'),
        new ApiClientError({ kind: 'network', source: 'network', message: 'offline' }),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    await expect(controller.logout()).resolves.toMatchObject({
      status: 'unauthenticated',
      error: { reason: 'logout_server_failed' },
    });
    expect(store.value).toBeNull();
  });

  it('terminal refresh failure clears protected state but ordinary 403 does not logout', async () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData([protectedQueryScope, 'me'], { id: 'old' });
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-login', 'refresh-login')]).apiClient,
      credentialStore: store,
      queryClient,
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    const forbidden = new ApiClientError({
      kind: 'permission',
      source: 'backend',
      message: 'forbidden',
      status: 403,
    });
    expect(controller.getState().status).toBe('authenticated');
    expect(forbidden.kind).toBe('permission');

    await controller.handleTerminalSessionFailure(
      new ApiClientError({
        kind: 'authentication',
        source: 'backend',
        message: 'expired',
        status: 401,
      }),
    );
    expect(controller.getState().status).toBe('unauthenticated');
    expect(queryClient.getQueryData([protectedQueryScope, 'me'])).toBeUndefined();
  });

  it('persists MOB-007 rotated R2 before callback success and rejects on persistence failure', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-login', 'refresh-login')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    await controller.authSeam.onCredentialsRefreshed({
      accessToken: 'access-B',
      refreshToken: 'refresh-R2',
    });
    expect(store.value).toBe('refresh-R2');
    expect(controller.authSeam.getAccessToken()).toBe('access-B');

    store.writeError = new Error('write failed');
    await expect(
      controller.authSeam.onCredentialsRefreshed({
        accessToken: 'access-C',
        refreshToken: 'refresh-R3',
      }),
    ).rejects.toMatchObject({ reason: 'secure_storage_write_failed' });
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
  });

  it('coordinates ten concurrent 401s into one refresh and one R2 SecureStore write', async () => {
    const store = new MemoryCredentialStore(null);
    const refresh = deferred<Response>();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      if (call.url.endsWith('/api/v1/auth/refresh')) return await refresh.promise;
      const replayedWithB =
        (call.init.headers as Record<string, string> | undefined)?.Authorization ===
        'Bearer access-B';
      return replayedWithB ? jsonResponse({ data: true }) : backendError(401, 'AUTH_REQUIRED');
    });
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-A', 'refresh-R1')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'coach@example.com', password: 'password' });
    store.writes = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: controller.authSeam,
    });

    const requests = Array.from({ length: 10 }, (_, index) =>
      client.request({ method: 'GET', path: `/protected-${index}` }),
    );
    await Promise.resolve();
    refresh.resolve(
      jsonResponse({
        data: { accessToken: 'access-B', refreshToken: 'refresh-R2', restrictedUntilVerified: false },
      }),
    );

    await expect(Promise.all(requests)).resolves.toHaveLength(10);
    expect(calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'))).toHaveLength(1);
    expect(store.writes).toEqual(['refresh-R2']);
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
  });

  it('rejects stale old-session refresh callbacks after a new login', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'a', password: 'password' });
    expect(controller.authSeam.getRefreshToken()).toBe('refresh-A');
    await controller.login({ identifier: 'b', password: 'password' });

    await expect(
      controller.authSeam.onCredentialsRefreshed({
        accessToken: 'access-A2',
        refreshToken: 'refresh-A2',
      }),
    ).rejects.toMatchObject({ reason: 'stale_credential_result' });
    expect(store.value).toBe('refresh-B');
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
  });

  it('prevents a late old SecureStore write from becoming the final credential', async () => {
    const firstWrite = deferred<void>();
    const store = new MemoryCredentialStore(null);
    store.writeDeferrals.push(firstWrite);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    const firstLogin = controller.login({ identifier: 'a', password: 'password' });
    await Promise.resolve();
    const secondLogin = controller.login({ identifier: 'b', password: 'password' });
    firstWrite.resolve();

    await expect(firstLogin).rejects.toMatchObject({ reason: 'stale_credential_result' });
    await expect(secondLogin).resolves.toMatchObject({ status: 'authenticated' });
    expect(store.value).toBe('refresh-B');
  });

  it('prevents a late old logout delete from erasing a new session credential', async () => {
    const deleteDelay = deferred<void>();
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        { data: { success: true } },
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'a', password: 'password' });
    store.deleteDeferrals.push(deleteDelay);

    const logout = controller.logout();
    await Promise.resolve();
    const secondLogin = controller.login({ identifier: 'b', password: 'password' });
    deleteDelay.resolve();

    await expect(logout).resolves.toMatchObject({ status: 'unauthenticated' });
    await expect(secondLogin).resolves.toMatchObject({ status: 'authenticated' });
    expect(store.value).toBe('refresh-B');
  });

  it('prevents old bootstrap and old query results from overwriting a new session', async () => {
    const store = new MemoryCredentialStore('refresh-R1');
    const bootstrapResponse = deferred<AuthTokenResponseDto>();
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        () => bootstrapResponse.promise,
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    const bootstrap = controller.initialize();
    await Promise.resolve();
    const login = controller.login({ identifier: 'new', password: 'password' });
    bootstrapResponse.resolve(authEnvelope('access-A2', 'refresh-A2'));

    await expect(bootstrap).rejects.toMatchObject({ reason: 'stale_credential_result' });
    await expect(login).resolves.toMatchObject({ status: 'authenticated' });
    expect(store.value).toBe('refresh-B');
    expect(
      controller.setProtectedQueryDataIfCurrent(1, [protectedQueryScope, 'old'], { id: 'old' }),
    ).toBe(false);
  });

  it('does not include tokens in query keys or logs', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-login', 'refresh-login')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await controller.login({ identifier: 'coach@example.com', password: 'password' });

    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(sensitiveStorageKeys.nativeRefreshToken).not.toContain('refresh-login');
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('does not poison the credential queue after write or delete failure', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        loginEnvelope('access-B', 'refresh-B'),
        { data: { success: true } },
        loginEnvelope('access-C', 'refresh-C'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    store.writeError = new Error('write failed');
    await expect(controller.login({ identifier: 'a', password: 'password' })).rejects.toMatchObject({
      reason: 'secure_storage_write_failed',
    });

    store.writeError = undefined;
    await expect(controller.login({ identifier: 'b', password: 'password' })).resolves.toMatchObject({
      status: 'authenticated',
    });
    expect(store.value).toBe('refresh-B');

    store.deleteError = new Error('delete failed');
    await expect(controller.logout()).rejects.toMatchObject({
      reason: 'secure_storage_delete_failed',
    });

    store.deleteError = undefined;
    await expect(controller.login({ identifier: 'c', password: 'password' })).resolves.toMatchObject({
      status: 'authenticated',
    });
    expect(store.value).toBe('refresh-C');
  });

  it('treats write-then-throw as storage uncertainty and blocks same-process bootstrap reuse', async () => {
    const store = new MemoryCredentialStore(null);
    store.writeError = new Error('native write rejected');
    store.writeSideEffectBeforeThrow = true;
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-A', 'refresh-A')]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    await expect(controller.login({ identifier: 'a', password: 'password' })).rejects.toMatchObject({
      reason: 'secure_storage_write_failed',
    });
    expect(controller.getState().status).toBe('security_failure');
    expect(controller.authSeam.getAccessToken()).toBeNull();
    expect(store.value).toBeNull();

    await expect(controller.initialize()).rejects.toMatchObject({
      reason: 'secure_storage_read_failed',
    });
  });

  it('models delete-then-throw as uncertainty but permits explicit fresh login recovery', async () => {
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        { data: { success: true } },
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'a', password: 'password' });
    store.deleteError = new Error('delete rejected');
    store.deleteSideEffectBeforeThrow = true;

    await expect(controller.logout()).rejects.toMatchObject({
      reason: 'secure_storage_delete_failed',
    });
    expect(controller.getState().status).toBe('security_failure');
    expect(store.value).toBeNull();

    store.deleteError = undefined;
    await expect(controller.login({ identifier: 'b', password: 'password' })).resolves.toMatchObject({
      status: 'authenticated',
    });
    expect(store.value).toBe('refresh-B');
  });

  it('fails all shared refresh waiters and clears cache when R2 persistence fails', async () => {
    const store = new MemoryCredentialStore(null);
    const queryClient = createQueryClient();
    const refresh = deferred<Response>();
    const calls: { url: string; init: RequestInit }[] = [];
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      if (call.url.endsWith('/api/v1/auth/refresh')) return await refresh.promise;
      return backendError(401, 'AUTH_REQUIRED');
    });
    const controller = new AuthSessionController({
      apiClient: createApiStub([loginEnvelope('access-A', 'refresh-R1')]).apiClient,
      credentialStore: store,
      queryClient,
    });
    await controller.login({ identifier: 'a', password: 'password' });
    queryClient.setQueryData(controller.protectedQueryKey(controller.getCurrentGeneration(), ['me']), {
      id: 'old',
    });
    store.writes = [];
    store.writeError = new Error('write failed');
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: controller.authSeam,
    });

    const requests = Array.from({ length: 10 }, (_, index) =>
      client.request({ method: 'GET', path: `/protected-${index}` }),
    );
    await Promise.resolve();
    refresh.resolve(
      jsonResponse({
        data: { accessToken: 'access-B', refreshToken: 'refresh-R2', restrictedUntilVerified: false },
      }),
    );

    await expect(Promise.all(requests)).rejects.toMatchObject({ kind: 'authentication' });
    expect(calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'))).toHaveLength(1);
    expect(store.writes).toEqual(['refresh-R2']);
    expect(controller.authSeam.getAccessToken()).toBeNull();
    expect(controller.getState().status).toBe('unauthenticated');
    expect(queryClient.getQueryData(controller.protectedQueryKey(1, ['me']))).toBeUndefined();
  });

  it('does not let old terminal refresh failure clear a newer session', async () => {
    const store = new MemoryCredentialStore(null);
    const queryClient = createQueryClient();
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient,
    });
    await controller.login({ identifier: 'a', password: 'password' });
    expect(controller.authSeam.getRefreshToken()).toBe('refresh-A');
    await controller.login({ identifier: 'b', password: 'password' });
    queryClient.setQueryData(controller.protectedQueryKey(controller.getCurrentGeneration(), ['me']), {
      id: 'b',
    });

    await controller.handleTerminalSessionFailure(
      new ApiClientError({
        kind: 'authentication',
        source: 'backend',
        status: 401,
        message: 'old expired',
      }),
    );

    expect(controller.getState().status).toBe('authenticated');
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
    expect(store.value).toBe('refresh-B');
    expect(
      queryClient.getQueryData(controller.protectedQueryKey(controller.getCurrentGeneration(), ['me'])),
    ).toEqual({ id: 'b' });
  });

  it('does not let old logout completion clear or delete a newer session', async () => {
    const serverLogout = deferred<unknown>();
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        () => serverLogout.promise,
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });
    await controller.login({ identifier: 'a', password: 'password' });

    const logout = controller.logout();
    await Promise.resolve();
    const loginB = controller.login({ identifier: 'b', password: 'password' });
    serverLogout.resolve({ data: { success: true } });

    await expect(logout).resolves.toMatchObject({ status: 'unauthenticated' });
    await expect(loginB).resolves.toMatchObject({ status: 'authenticated' });
    expect(controller.getState().status).toBe('authenticated');
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
    expect(store.value).toBe('refresh-B');
  });

  it('keeps latest login B when login A resolves or fails late', async () => {
    const lateA = deferred<LoginResponseDto>();
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        () => lateA.promise,
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    const loginA = controller.login({ identifier: 'a', password: 'password' });
    await Promise.resolve();
    const loginB = controller.login({ identifier: 'b', password: 'password' });
    lateA.resolve(loginEnvelope('access-A', 'refresh-A'));

    await expect(loginA).rejects.toMatchObject({ reason: 'stale_credential_result' });
    await expect(loginB).resolves.toMatchObject({ status: 'authenticated' });
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
    expect(store.value).toBe('refresh-B');

    const failingA = deferred<LoginResponseDto>();
    const second = new AuthSessionController({
      apiClient: createApiStub([
        () => failingA.promise,
        loginEnvelope('access-D', 'refresh-D'),
      ]).apiClient,
      credentialStore: new MemoryCredentialStore(null),
      queryClient: createQueryClient(),
    });
    const oldLogin = second.login({ identifier: 'old', password: 'password' });
    await Promise.resolve();
    const newLogin = second.login({ identifier: 'new', password: 'password' });
    failingA.reject(new Error('old network failure'));

    await expect(oldLogin).rejects.toMatchObject({ reason: 'stale_credential_result' });
    await expect(newLogin).resolves.toMatchObject({ status: 'authenticated' });
    expect(second.authSeam.getAccessToken()).toBe('access-D');
  });

  it('does not let stale MFA completion overwrite a newer login session', async () => {
    const lateMfa = deferred<AuthTokenResponseDto>();
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        () => lateMfa.promise,
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient: createQueryClient(),
    });

    const mfa = controller.completeMfaLogin({
      mfaChallengeToken: 'challenge-A',
      factorType: 'TOTP',
      credential: '111111',
    });
    await Promise.resolve();
    const loginB = controller.login({ identifier: 'b', password: 'password' });
    lateMfa.resolve(authEnvelope('access-A', 'refresh-A'));

    await expect(mfa).rejects.toMatchObject({ reason: 'stale_credential_result' });
    await expect(loginB).resolves.toMatchObject({ status: 'authenticated' });
    expect(controller.authSeam.getAccessToken()).toBe('access-B');
    expect(store.value).toBe('refresh-B');
  });

  it('removes late protected query results after logout or account replacement', async () => {
    const queryClient = createQueryClient();
    const store = new MemoryCredentialStore(null);
    const controller = new AuthSessionController({
      apiClient: createApiStub([
        loginEnvelope('access-A', 'refresh-A'),
        { data: { success: true } },
        loginEnvelope('access-B', 'refresh-B'),
      ]).apiClient,
      credentialStore: store,
      queryClient,
    });
    await controller.login({ identifier: 'a', password: 'password' });
    const generationA = controller.getCurrentGeneration();
    const queryA = queryClient.fetchQuery({
      queryKey: controller.protectedQueryKey(generationA, ['profile']),
      queryFn: async () => ({ id: 'a' }),
    });
    const queryASettled = queryA.catch((error: unknown) => error);

    await controller.logout();
    await queryASettled;
    expect(queryClient.getQueryData(controller.protectedQueryKey(generationA, ['profile']))).toBeUndefined();

    await controller.login({ identifier: 'b', password: 'password' });
    const generationB = controller.getCurrentGeneration();
    queryClient.setQueryData(controller.protectedQueryKey(generationA, ['profile']), { id: 'a-late' });
    queryClient.setQueryData(controller.protectedQueryKey(generationB, ['profile']), { id: 'b' });

    expect(queryClient.getQueryData(controller.protectedQueryKey(generationA, ['profile']))).toBeUndefined();
    expect(queryClient.getQueryData(controller.protectedQueryKey(generationB, ['profile']))).toEqual({
      id: 'b',
    });
  });
});
