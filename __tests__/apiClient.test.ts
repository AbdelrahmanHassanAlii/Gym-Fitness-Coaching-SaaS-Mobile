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

  it('rejects endpoint strings that would bypass the configured backend origin', () => {
    expect(() => composeApiUrl('https://api.example.test', 'https://evil.test/path')).toThrow(
      'API path must start with /.',
    );
    expect(() => composeApiUrl('https://api.example.test', '//evil.test/path')).toThrow(
      'API path must be relative',
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
