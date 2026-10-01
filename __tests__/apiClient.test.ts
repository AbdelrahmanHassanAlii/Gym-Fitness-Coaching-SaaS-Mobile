import { describe, expect, it, jest } from '@jest/globals';

import { createApiClient, composeApiUrl } from '@/api';

const jsonHeaders = { 'content-type': 'application/json' };

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { ...jsonHeaders, ...(init.headers as Record<string, string> | undefined) },
  });
}

function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}

function backendError(status: number, code: string): Response {
  return jsonResponse(
    { error: { code, message: code, correlationId: 'correlation-id', details: { field: 'x' } } },
    { status },
  );
}

function createFetchMock(responses: (Response | Error | (() => Promise<Response>))[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    const next = responses.shift();
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return await next();
    if (!next) throw new Error('Unexpected fetch call.');
    return next;
  });

  return { fetchMock, calls };
}

function createClient(fetchMock: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return createApiClient({ baseUrl: 'https://api.example.test/root/', fetch: fetchMock });
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

describe('api transport foundation', () => {
  it('composes the configured base URL, API prefix, relative path, and query', () => {
    expect(
      composeApiUrl('https://api.example.test/root/', '/relationships', {
        cursor: 'opaque==',
        page: 2,
        unread: false,
        tags: ['a', 'b'],
        empty: null,
      }),
    ).toBe(
      'https://api.example.test/root/api/v1/relationships?cursor=opaque%3D%3D&page=2&unread=false&tags=a&tags=b',
    );
  });

  it('serializes query values without mutating null, dates, cursors, or reserved characters', () => {
    expect(
      composeApiUrl('https://api.example.test/', '/search', {
        skippedUndefined: undefined,
        skippedNull: null,
        enabled: false,
        count: 0,
        empty: '',
        tags: ['one', 'two'],
        dateOnly: '2026-10-01',
        timestamp: '2026-10-01T12:30:00+02:00',
        cursor: 'opaque:/+=?',
        q: 'protein & sleep',
      }),
    ).toBe(
      'https://api.example.test/api/v1/search?enabled=false&count=0&empty=&tags=one&tags=two&dateOnly=2026-10-01&timestamp=2026-10-01T12%3A30%3A00%2B02%3A00&cursor=opaque%3A%2F%2B%3D%3F&q=protein+%26+sleep',
    );
  });

  it('rejects endpoint strings that would bypass the configured backend origin', () => {
    expect(() => composeApiUrl('https://api.example.test', 'https://evil.test/path')).toThrow(
      'API path must start with /.',
    );
    expect(() => composeApiUrl('https://api.example.test', '//evil.test/path')).toThrow(
      'API path must be relative',
    );
    expect(() => composeApiUrl('https://api.example.test', '/https://evil.test/path')).not.toThrow();
    expect(composeApiUrl('https://api.example.test/root/', '/api/v1/me')).toBe(
      'https://api.example.test/root/api/v1/me',
    );
    expect(composeApiUrl('https://api.example.test/root/api/v1/', '/me')).toBe(
      'https://api.example.test/root/api/v1/me',
    );
  });

  it('serializes JSON request bodies and parses JSON success responses', async () => {
    const { fetchMock, calls } = createFetchMock([jsonResponse({ data: { ok: true } })]);
    const client = createClient(fetchMock);

    await expect(
      client.request<{ data: { ok: boolean } }, undefined, { expectedVersion: number }>({
        method: 'PATCH',
        path: '/thing',
        body: { expectedVersion: 7 },
      }),
    ).resolves.toEqual({ data: { ok: true } });

    expect(calls[0]?.init.body).toBe(JSON.stringify({ expectedVersion: 7 }));
    expect((calls[0]?.init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });

  it('serializes supported JSON body edge cases and omits undefined bodies', async () => {
    const { fetchMock, calls } = createFetchMock([
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
    ]);
    const client = createClient(fetchMock);

    await client.request({ method: 'POST', path: '/undefined' });
    await client.request({ method: 'POST', path: '/null', body: null });
    await client.request({ method: 'POST', path: '/false', body: false });
    await client.request({ method: 'POST', path: '/zero', body: 0 });
    await client.request({ method: 'POST', path: '/empty-string', body: '' });

    expect(calls[0]?.init.body).toBeUndefined();
    expect(calls[1]?.init.body).toBe('null');
    expect(calls[2]?.init.body).toBe('false');
    expect(calls[3]?.init.body).toBe('0');
    expect(calls[4]?.init.body).toBe('""');
  });

  it('returns undefined for 204 and empty success responses', async () => {
    const { fetchMock } = createFetchMock([emptyResponse(), new Response('', { status: 200 })]);
    const client = createClient(fetchMock);

    await expect(client.request<void>({ method: 'DELETE', path: '/empty' })).resolves.toBeUndefined();
    await expect(client.request<void>({ method: 'GET', path: '/empty-200' })).resolves.toBeUndefined();
  });

  it('attaches Authorization only when an access token is supplied', async () => {
    const { fetchMock, calls } = createFetchMock([
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
    ]);
    const client = createClient(fetchMock);

    await client.request({ method: 'GET', path: '/with-token', accessToken: 'access-token' });
    await client.request({ method: 'GET', path: '/without-token' });

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-token',
    );
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('uses an injected auth seam for access tokens without owning token state', async () => {
    const { fetchMock, calls } = createFetchMock([jsonResponse({ data: true })]);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getAccessToken: () => 'seam-access-token' },
    });

    await client.request({ method: 'GET', path: '/me' });

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer seam-access-token',
    );
  });

  it('sends explicit idempotency keys only when supplied', async () => {
    const { fetchMock, calls } = createFetchMock([
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
    ]);
    const client = createClient(fetchMock);

    await client.request({ method: 'POST', path: '/command', idempotencyKey: 'command-key' });
    await client.request({ method: 'POST', path: '/ordinary-mutation' });

    expect((calls[0]?.init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'command-key',
    );
    expect((calls[1]?.init.headers as Record<string, string>)['Idempotency-Key']).toBeUndefined();
  });

  it.each([
    'authorization',
    'AUTHORIZATION',
    'Idempotency-key',
    'X-Support-Session-Id',
    'Cookie',
  ])('rejects protected custom header override %s', async (headerName) => {
    const { fetchMock } = createFetchMock([jsonResponse({ data: true })]);
    const client = createClient(fetchMock);

    await expect(
      client.request({
        method: 'GET',
        path: '/protected-header',
        headers: { [headerName]: 'malicious' },
      }),
    ).rejects.toMatchObject({
      kind: 'validation',
      source: 'transport',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves expectedVersion request bodies exactly', async () => {
    const { fetchMock, calls } = createFetchMock([jsonResponse({ data: true })]);
    const client = createClient(fetchMock);

    await client.request({
      method: 'PATCH',
      path: '/cas',
      body: { expectedVersion: 0, value: 'unchanged' },
    });

    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      expectedVersion: 0,
      value: 'unchanged',
    });
  });

  it('normalizes backend error envelopes and preserves fields', async () => {
    const { fetchMock } = createFetchMock([backendError(409, 'EXPECTED_VERSION_CONFLICT')]);
    const client = createClient(fetchMock);

    await expect(client.request({ method: 'PATCH', path: '/cas' })).rejects.toMatchObject({
      kind: 'expected_version_conflict',
      source: 'backend',
      status: 409,
      code: 'EXPECTED_VERSION_CONFLICT',
      correlationId: 'correlation-id',
      details: { field: 'x' },
    });
  });

  it.each([
    [400, 'VALIDATION_ERROR', 'validation'],
    [403, 'PERMISSION_DENIED', 'permission'],
    [403, 'RELATIONSHIP_ACCESS_DENIED', 'relationship_access'],
    [404, 'NOT_FOUND', 'not_found'],
    [409, 'EXPECTED_VERSION_CONFLICT', 'expected_version_conflict'],
    [409, 'IDEMPOTENCY_CONFLICT', 'idempotency_conflict'],
    [402, 'SUBSCRIPTION_REQUIRED', 'subscription_or_entitlement'],
    [429, 'QUOTA_EXCEEDED', 'quota'],
    [400, 'UPLOAD_CHECKSUM_MISMATCH', 'file_or_provider'],
    [500, 'INTERNAL_ERROR', 'http'],
  ])('classifies backend %s %s as %s', async (status, code, kind) => {
    const { fetchMock } = createFetchMock([backendError(status, code)]);
    const client = createClient(fetchMock);

    await expect(client.request({ method: 'GET', path: '/error' })).rejects.toMatchObject({
      kind,
      source: 'backend',
      status,
      code,
    });
  });

  it('preserves backend 401 details when a replay also fails authentication', async () => {
    const { fetchMock } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh', restrictedUntilVerified: false },
      }),
      backendError(401, 'AUTH_REQUIRED'),
    ]);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getRefreshToken: () => 'old-refresh' },
    });

    await expect(client.request({ method: 'GET', path: '/me' })).rejects.toMatchObject({
      kind: 'authentication',
      source: 'backend',
      status: 401,
      code: 'AUTH_REQUIRED',
    });
  });

  it('normalizes non-JSON proxy/server errors without inventing backend codes', async () => {
    const { fetchMock } = createFetchMock([
      new Response('<html>bad gateway</html>', {
        status: 502,
        headers: { 'content-type': 'text/html' },
      }),
    ]);
    const client = createClient(fetchMock);

    await expect(client.request({ method: 'GET', path: '/proxy-error' })).rejects.toMatchObject({
      kind: 'http',
      source: 'backend',
      status: 502,
      code: undefined,
    });
  });

  it('distinguishes network failure, abort, malformed JSON, and non-JSON success', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const { fetchMock } = createFetchMock([
      new TypeError('offline'),
      abortError,
      new Response('{', { status: 200, headers: jsonHeaders }),
      new Response('ok', { status: 200, headers: { 'content-type': 'text/plain' } }),
    ]);
    const client = createClient(fetchMock);

    await expect(client.request({ method: 'GET', path: '/network' })).rejects.toMatchObject({
      kind: 'network',
      source: 'network',
    });
    await expect(client.request({ method: 'GET', path: '/abort' })).rejects.toMatchObject({
      kind: 'abort',
      source: 'network',
    });
    await expect(client.request({ method: 'GET', path: '/bad-json' })).rejects.toMatchObject({
      kind: 'malformed_response',
      source: 'transport',
    });
    await expect(client.request({ method: 'GET', path: '/non-json' })).rejects.toMatchObject({
      kind: 'malformed_response',
      source: 'transport',
    });
  });

  it('passes AbortSignal to fetch without adding default timeout policy', async () => {
    const controller = new AbortController();
    const { fetchMock, calls } = createFetchMock([jsonResponse({ data: true })]);
    const client = createClient(fetchMock);

    await client.request({ method: 'GET', path: '/abortable', signal: controller.signal });

    expect(calls[0]?.init.signal).toBe(controller.signal);
  });

  it('performs one native refresh and replays the original request at most once', async () => {
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh', restrictedUntilVerified: false },
      }),
      jsonResponse({ data: { ok: true } }),
    ]);
    const refreshed: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getAccessToken: () => 'old-access',
        getRefreshToken: () => 'old-refresh',
        onCredentialsRefreshed: (credentials) => {
          refreshed.push(credentials);
        },
      },
    });

    await expect(
      client.request({
        method: 'POST',
        path: '/command',
        body: { expectedVersion: 3 },
        idempotencyKey: 'same-command-key',
      }),
    ).resolves.toEqual({ data: { ok: true } });

    expect(calls).toHaveLength(3);
    expect(calls[1]?.url).toBe('https://api.example.test/api/v1/auth/refresh');
    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      clientType: 'MOBILE',
      refreshToken: 'old-refresh',
    });
    expect((calls[1]?.init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect((calls[2]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer new-access',
    );
    expect((calls[2]?.init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      'same-command-key',
    );
    expect(JSON.parse(String(calls[2]?.init.body))).toEqual({ expectedVersion: 3 });
    expect(refreshed).toEqual([{ accessToken: 'new-access', refreshToken: 'new-refresh' }]);
  });

  it('replays with refresh-returned access token even when the auth seam still returns stale access', async () => {
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'access-B', refreshToken: 'refresh-R2', restrictedUntilVerified: false },
      }),
      jsonResponse({ data: { ok: true } }),
    ]);
    const refreshed: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getAccessToken: () => 'access-A',
        getRefreshToken: () => 'refresh-R1',
        onCredentialsRefreshed: async (credentials) => {
          refreshed.push(credentials);
        },
      },
    });

    await client.request({ method: 'GET', path: '/stale-access' });

    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-A',
    );
    expect((calls[2]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer access-B',
    );
    expect(refreshed).toEqual([{ accessToken: 'access-B', refreshToken: 'refresh-R2' }]);
  });

  it('does not replay more than once after another 401', async () => {
    const { fetchMock } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh', restrictedUntilVerified: false },
      }),
      backendError(401, 'AUTH_REQUIRED'),
    ]);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getRefreshToken: () => 'old-refresh' },
    });

    await expect(client.request({ method: 'GET', path: '/me' })).rejects.toMatchObject({
      kind: 'authentication',
      status: 401,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('clears the refresh flight and does not replay when credential propagation fails', async () => {
    let failCallback = true;
    const responses = [
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh', restrictedUntilVerified: false },
      }),
    ];
    const { fetchMock, calls } = createFetchMock(responses);
    const expired: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getRefreshToken: () => 'old-refresh',
        onCredentialsRefreshed: () => {
          if (failCallback) throw new Error('persistence failed');
        },
        onSessionExpired: (error) => {
          expired.push(error);
        },
      },
    });

    await expect(client.request({ method: 'GET', path: '/first' })).rejects.toMatchObject({
      kind: 'authentication',
      source: 'transport',
    });
    expect(calls).toHaveLength(2);
    expect(expired).toHaveLength(1);

    failCallback = false;
    responses.push(
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'second-access', refreshToken: 'second-refresh', restrictedUntilVerified: false },
      }),
      jsonResponse({ data: true }),
    );

    await expect(client.request({ method: 'GET', path: '/second' })).resolves.toEqual({
      data: true,
    });
    expect(calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'))).toHaveLength(2);
  });

  it('does not recursively refresh the refresh request and reports terminal failure', async () => {
    const expired: unknown[] = [];
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      backendError(401, 'REFRESH_TOKEN_INVALID'),
    ]);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getRefreshToken: () => 'expired-refresh',
        onSessionExpired: (error) => {
          expired.push(error);
        },
      },
    });

    await expect(client.request({ method: 'GET', path: '/me' })).rejects.toMatchObject({
      code: 'REFRESH_TOKEN_INVALID',
    });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe('https://api.example.test/api/v1/auth/refresh');
    expect(expired).toHaveLength(1);
  });

  it.each([
    ['refresh 400', backendError(400, 'VALIDATION_ERROR'), { status: 400 }],
    ['refresh 401', backendError(401, 'REFRESH_TOKEN_INVALID'), { status: 401 }],
    ['refresh 403', backendError(403, 'PERMISSION_DENIED'), { status: 403 }],
    ['refresh 500', backendError(500, 'INTERNAL_ERROR'), { status: 500 }],
    ['network failure', new TypeError('offline'), { kind: 'network' }],
    ['malformed JSON', new Response('{', { status: 200, headers: jsonHeaders }), { kind: 'malformed_response' }],
    [
      'missing credentials',
      jsonResponse({ data: { refreshToken: 'rotated-refresh', restrictedUntilVerified: false } }),
      { kind: 'malformed_response' },
    ],
  ])('handles %s without recursion, replay, or deadlock', async (_name, refreshFailure, expected) => {
    const responses = [backendError(401, 'AUTH_REQUIRED'), refreshFailure];
    const { fetchMock, calls } = createFetchMock(responses);
    const expired: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getRefreshToken: () => 'old-refresh',
        onSessionExpired: (error) => {
          expired.push(error);
        },
      },
    });

    await expect(client.request({ method: 'GET', path: '/me' })).rejects.toMatchObject(expected);

    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe('https://api.example.test/api/v1/auth/refresh');
    expect(expired).toHaveLength(1);
  });

  it('coordinates concurrent 401s through one refresh and replays waiters with refreshed access', async () => {
    let resolveRefresh: ((value: Response) => void) | undefined;
    const refreshResponse = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      backendError(401, 'AUTH_REQUIRED'),
      () => refreshResponse,
      jsonResponse({ data: { first: true } }),
      jsonResponse({ data: { second: true } }),
    ]);
    const refreshed: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getAccessToken: () => 'old-access',
        getRefreshToken: () => 'rotating-refresh',
        onCredentialsRefreshed: (credentials) => {
          refreshed.push(credentials);
        },
      },
    });

    const first = client.request({ method: 'GET', path: '/first' });
    const second = client.request({ method: 'GET', path: '/second' });

    await Promise.resolve();
    resolveRefresh?.(
      jsonResponse({
        data: {
          accessToken: 'single-flight-access',
          refreshToken: 'rotated-refresh',
          restrictedUntilVerified: false,
        },
      }),
    );

    await expect(Promise.all([first, second])).resolves.toEqual([
      { data: { first: true } },
      { data: { second: true } },
    ]);

    const refreshCalls = calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
    expect(JSON.parse(String(refreshCalls[0]?.init.body)).refreshToken).toBe('rotating-refresh');
    expect((calls[3]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer single-flight-access',
    );
    expect((calls[4]?.init.headers as Record<string, string>).Authorization).toBe(
      'Bearer single-flight-access',
    );
    expect(refreshed).toEqual([
      { accessToken: 'single-flight-access', refreshToken: 'rotated-refresh' },
    ]);
  });

  it('coordinates ten simultaneous 401s through one refresh callback and preserves per-command idempotency', async () => {
    const refresh = deferred<Response>();
    const responses: (Response | (() => Promise<Response>))[] = [
      ...Array.from({ length: 10 }, () => backendError(401, 'AUTH_REQUIRED')),
      () => refresh.promise,
      ...Array.from({ length: 10 }, (_, index) => jsonResponse({ data: { index } })),
    ];
    const { fetchMock, calls } = createFetchMock(responses);
    const refreshed: unknown[] = [];
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: {
        getAccessToken: () => 'access-A',
        getRefreshToken: () => 'refresh-R1',
        onCredentialsRefreshed: (credentials) => {
          refreshed.push(credentials);
        },
      },
    });

    const requests = Array.from({ length: 10 }, (_, index) =>
      client.request({
        method: 'POST',
        path: `/command-${index}`,
        idempotencyKey: index === 9 ? undefined : `K${index}`,
      }),
    );

    await Promise.resolve();
    refresh.resolve(
      jsonResponse({
        data: { accessToken: 'access-B', refreshToken: 'refresh-R2', restrictedUntilVerified: false },
      }),
    );

    await expect(Promise.all(requests)).resolves.toHaveLength(10);

    const refreshCalls = calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'));
    const replayCalls = calls.slice(11);
    expect(refreshCalls).toHaveLength(1);
    expect(JSON.parse(String(refreshCalls[0]?.init.body)).refreshToken).toBe('refresh-R1');
    expect(refreshed).toEqual([{ accessToken: 'access-B', refreshToken: 'refresh-R2' }]);
    expect(replayCalls).toHaveLength(10);
    for (const [index, call] of replayCalls.entries()) {
      const headers = call.init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer access-B');
      if (index === 9) {
        expect(headers['Idempotency-Key']).toBeUndefined();
      } else {
        expect(headers['Idempotency-Key']).toBe(`K${index}`);
      }
    }
  });

  it('keeps refresh flights isolated per client instance', async () => {
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'access-X2', refreshToken: 'refresh-X2', restrictedUntilVerified: false },
      }),
      jsonResponse({
        data: { accessToken: 'access-Y2', refreshToken: 'refresh-Y2', restrictedUntilVerified: false },
      }),
      jsonResponse({ data: 'x' }),
      jsonResponse({ data: 'y' }),
    ]);
    const clientX = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getAccessToken: () => 'access-X1', getRefreshToken: () => 'refresh-X1' },
    });
    const clientY = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getAccessToken: () => 'access-Y1', getRefreshToken: () => 'refresh-Y1' },
    });

    await expect(
      Promise.all([
        clientX.request({ method: 'GET', path: '/x' }),
        clientY.request({ method: 'GET', path: '/y' }),
      ]),
    ).resolves.toEqual([{ data: 'x' }, { data: 'y' }]);

    const refreshBodies = calls
      .filter((call) => call.url.endsWith('/api/v1/auth/refresh'))
      .map((call) => JSON.parse(String(call.init.body)));
    expect(refreshBodies).toEqual([
      { clientType: 'MOBILE', refreshToken: 'refresh-X1' },
      { clientType: 'MOBILE', refreshToken: 'refresh-Y1' },
    ]);
    expect((calls[4]?.init.headers as Record<string, string>).Authorization).toBe('Bearer access-X2');
    expect((calls[5]?.init.headers as Record<string, string>).Authorization).toBe('Bearer access-Y2');
  });

  it('does not let an aborted waiter cancel shared refresh needed by another request', async () => {
    const refresh = deferred<Response>();
    const calls: { url: string; init: RequestInit }[] = [];
    const firstAttemptPaths = new Set<string>();
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const call = { url: String(input), init: init ?? {} };
      calls.push(call);
      if (call.init.signal?.aborted) throw abortError;
      if (call.url.endsWith('/api/v1/auth/refresh')) return await refresh.promise;
      if (!firstAttemptPaths.has(call.url)) {
        firstAttemptPaths.add(call.url);
        return backendError(401, 'AUTH_REQUIRED');
      }
      return jsonResponse({ data: { ok: true } });
    });
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getRefreshToken: () => 'refresh-R1' },
    });
    const abortingController = new AbortController();

    const first = client.request({
      method: 'GET',
      path: '/aborting',
      signal: abortingController.signal,
    });
    const second = client.request({ method: 'GET', path: '/waiting' });

    await Promise.resolve();
    abortingController.abort();
    refresh.resolve(
      jsonResponse({
        data: { accessToken: 'access-B', refreshToken: 'refresh-R2', restrictedUntilVerified: false },
      }),
    );

    await expect(first).rejects.toMatchObject({ kind: 'abort' });
    await expect(second).resolves.toEqual({ data: { ok: true } });
    expect(calls.filter((call) => call.url.endsWith('/api/v1/auth/refresh'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith('/api/v1/aborting'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.endsWith('/api/v1/waiting'))).toHaveLength(2);
  });

  it('keeps support session headers absent unless explicitly supplied', async () => {
    const { fetchMock, calls } = createFetchMock([
      jsonResponse({ data: true }),
      jsonResponse({ data: true }),
    ]);
    const client = createClient(fetchMock);

    await client.request({ method: 'GET', path: '/ordinary' });
    await client.request({ method: 'GET', path: '/support', supportSessionId: 'support-session' });

    expect((calls[0]?.init.headers as Record<string, string>)['x-support-session-id']).toBeUndefined();
    expect((calls[1]?.init.headers as Record<string, string>)['x-support-session-id']).toBe(
      'support-session',
    );
  });

  it('does not convert date-only strings or interpret opaque cursors', async () => {
    const { fetchMock, calls } = createFetchMock([jsonResponse({ data: true })]);
    const client = createClient(fetchMock);

    await client.request({
      method: 'GET',
      path: '/analytics',
      query: { from: '2026-10-01', cursor: 'opaque:category-bound==', limit: 20 },
    });

    expect(calls[0]?.url).toContain('from=2026-10-01');
    expect(calls[0]?.url).toContain('cursor=opaque%3Acategory-bound%3D%3D');
    expect(calls[0]?.url).toContain('limit=20');
  });

  it('does not add cookie-based Web refresh behavior', async () => {
    const { fetchMock, calls } = createFetchMock([
      backendError(401, 'AUTH_REQUIRED'),
      jsonResponse({
        data: { accessToken: 'new-access', refreshToken: 'new-refresh', restrictedUntilVerified: false },
      }),
      jsonResponse({ data: true }),
    ]);
    const client = createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: fetchMock,
      auth: { getRefreshToken: () => 'native-refresh' },
    });

    await client.request({ method: 'GET', path: '/me' });

    expect(JSON.parse(String(calls[1]?.init.body))).toEqual({
      clientType: 'MOBILE',
      refreshToken: 'native-refresh',
    });
    expect((calls[1]?.init.headers as Record<string, string>).Cookie).toBeUndefined();
  });

  it('does not expose a gym dashboard service surface', () => {
    const apiSurface = Object.keys(jest.requireActual('@/api') as Record<string, unknown>);

    expect(apiSurface.some((key) => key.toLowerCase().includes('gym'))).toBe(false);
  });
});
