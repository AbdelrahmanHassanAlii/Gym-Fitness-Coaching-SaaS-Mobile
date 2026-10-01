import { publicClientConfig } from '@/config/publicConfig';
import { isApiErrorBody, mobileAuthClientType } from '@/contracts';
import {
  ApiClientError,
  createBackendError,
  createHttpError,
  createMalformedResponseError,
  createNetworkError,
  isApiClientError,
} from './errors';
import { composeApiUrl, type QueryParams } from './url';

export type ApiMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface ApiCredentials {
  accessToken: string;
  refreshToken: string;
}

export interface ApiAuthSeam {
  getAccessToken?: () => string | null | Promise<string | null>;
  getRefreshToken?: () => string | null | Promise<string | null>;
  onCredentialsRefreshed?: (credentials: ApiCredentials) => void | Promise<void>;
  onSessionExpired?: (error: ApiClientError) => void | Promise<void>;
}

export interface ApiClientOptions {
  baseUrl?: string | null;
  fetch?: FetchLike;
  auth?: ApiAuthSeam;
}

export interface ApiRequestOptions<TQuery extends QueryParams | undefined, TBody> {
  method: ApiMethod;
  path: string;
  query?: TQuery;
  body?: TBody;
  accessToken?: string | null;
  idempotencyKey?: string;
  supportSessionId?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

interface InternalRequestOptions<TQuery extends QueryParams | undefined, TBody>
  extends ApiRequestOptions<TQuery, TBody> {
  replayed?: boolean;
  skipRefresh?: boolean;
}

export interface ApiClient {
  request<TResponse, TQuery extends QueryParams | undefined = undefined, TBody = undefined>(
    options: ApiRequestOptions<TQuery, TBody>,
  ): Promise<TResponse>;
}

const protectedHeaderNames = new Set([
  'authorization',
  'cookie',
  'idempotency-key',
  'x-support-session-id',
]);

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? publicClientConfig.backendBaseUrl;
  if (!baseUrl) throw new Error('EXPO_PUBLIC_API_BASE_URL is required to create the API client.');
  const backendBaseUrl = baseUrl;

  const fetchImpl = options.fetch ?? fetch;
  const auth = options.auth;
  let refreshPromise: Promise<ApiCredentials> | null = null;

  async function request<
    TResponse,
    TQuery extends QueryParams | undefined = undefined,
    TBody = undefined,
  >(requestOptions: ApiRequestOptions<TQuery, TBody>): Promise<TResponse> {
    return requestInternal<TResponse, TQuery, TBody>(requestOptions);
  }

  async function requestInternal<
    TResponse,
    TQuery extends QueryParams | undefined,
    TBody,
  >(requestOptions: InternalRequestOptions<TQuery, TBody>): Promise<TResponse> {
    try {
      return await send<TResponse, TQuery, TBody>(requestOptions);
    } catch (error) {
      if (!shouldRefresh(error, requestOptions)) throw error;

      const credentials = await refreshOnce();
      if (requestOptions.signal?.aborted) throw createAbortedBeforeReplayError();
      return await send<TResponse, TQuery, TBody>({
        ...requestOptions,
        accessToken: credentials.accessToken,
        replayed: true,
      });
    }
  }

  async function send<TResponse, TQuery extends QueryParams | undefined, TBody>(
    requestOptions: InternalRequestOptions<TQuery, TBody>,
  ): Promise<TResponse> {
    const response = await fetchWithNetworkErrors(
      fetchImpl,
      composeApiUrl(backendBaseUrl, requestOptions.path, requestOptions.query),
      {
        method: requestOptions.method,
        headers: await buildHeaders(requestOptions),
        ...(requestOptions.body !== undefined ? { body: JSON.stringify(requestOptions.body) } : {}),
        ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
      },
    );

    return await parseResponse<TResponse>(response);
  }

  async function buildHeaders<TQuery extends QueryParams | undefined, TBody>(
    requestOptions: InternalRequestOptions<TQuery, TBody>,
  ): Promise<HeadersInit> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...safeCustomHeaders(requestOptions.headers),
    };

    if (requestOptions.body !== undefined && !hasHeader(headers, 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }

    const accessToken =
      requestOptions.accessToken === undefined
        ? await auth?.getAccessToken?.()
        : requestOptions.accessToken;
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    if (requestOptions.idempotencyKey) {
      headers['Idempotency-Key'] = requestOptions.idempotencyKey;
    }

    if (requestOptions.supportSessionId) {
      headers['x-support-session-id'] = requestOptions.supportSessionId;
    }

    return headers;
  }

  async function refreshOnce(): Promise<ApiCredentials> {
    if (!auth?.getRefreshToken) {
      throw new ApiClientError({
        kind: 'authentication',
        source: 'transport',
        message: 'No refresh token seam is available.',
      });
    }

    refreshPromise ??= performRefresh()
      .catch(async (error: unknown) => {
        const apiError = isApiClientError(error)
          ? error
          : new ApiClientError({
              kind: 'authentication',
              source: 'transport',
              message: 'Refresh failed.',
              cause: error,
            });
        await auth.onSessionExpired?.(apiError);
        throw apiError;
      })
      .finally(() => {
        refreshPromise = null;
      });

    return await refreshPromise;
  }

  async function performRefresh(): Promise<ApiCredentials> {
    const refreshToken = await auth?.getRefreshToken?.();
    if (!refreshToken) {
      throw new ApiClientError({
        kind: 'authentication',
        source: 'transport',
        message: 'No refresh token is available.',
      });
    }

    const response = await send<{
      data: { accessToken: string; refreshToken?: string; restrictedUntilVerified: boolean };
    }, undefined, { clientType: typeof mobileAuthClientType; refreshToken: string }>({
      method: 'POST',
      path: '/auth/refresh',
      body: { clientType: mobileAuthClientType, refreshToken },
      accessToken: null,
      skipRefresh: true,
    });

    if (!hasNativeCredentials(response.data)) {
      throw createMalformedResponseError(
        'Native refresh response did not include valid access and refresh tokens.',
      );
    }

    const credentials = {
      accessToken: response.data.accessToken,
      refreshToken: response.data.refreshToken,
    };
    await auth?.onCredentialsRefreshed?.(credentials);
    return credentials;
  }

  return { request };
}

async function fetchWithNetworkErrors(
  fetchImpl: FetchLike,
  input: RequestInfo | URL,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetchImpl(input, init);
  } catch (error) {
    throw createNetworkError(error);
  }
}

async function parseResponse<TResponse>(response: Response): Promise<TResponse> {
  if (response.status === 204) return undefined as TResponse;

  const text = await response.text();
  if (!text) {
    if (response.ok) return undefined as TResponse;
    throw createHttpError(response.status, `Request failed with status ${response.status}.`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) {
    if (response.ok) throw createMalformedResponseError('Expected a JSON response.');
    throw createHttpError(response.status, `Request failed with status ${response.status}.`);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw createMalformedResponseError('Response body was not valid JSON.', error);
  }

  if (!response.ok) {
    if (isApiErrorBody(body)) throw createBackendError(response.status, body);
    throw createHttpError(response.status, `Request failed with status ${response.status}.`);
  }

  return body as TResponse;
}

function shouldRefresh<TQuery extends QueryParams | undefined, TBody>(
  error: unknown,
  requestOptions: InternalRequestOptions<TQuery, TBody>,
): error is ApiClientError {
  return (
    isApiClientError(error) &&
    error.kind === 'authentication' &&
    error.status === 401 &&
    !requestOptions.replayed &&
    !requestOptions.skipRefresh
  );
}

function hasHeader(headers: Record<string, string>, headerName: string): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === headerName.toLowerCase());
}

function hasNativeCredentials(
  value: unknown,
): value is { accessToken: string; refreshToken: string; restrictedUntilVerified: boolean } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { accessToken?: unknown; refreshToken?: unknown };
  return (
    typeof candidate.accessToken === 'string' &&
    candidate.accessToken.length > 0 &&
    typeof candidate.refreshToken === 'string' &&
    candidate.refreshToken.length > 0
  );
}

function safeCustomHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers) return {};

  for (const key of Object.keys(headers)) {
    if (protectedHeaderNames.has(key.toLowerCase())) {
      throw new ApiClientError({
        kind: 'validation',
        source: 'transport',
        message: `Header "${key}" is controlled by the API transport.`,
      });
    }
  }

  return headers;
}

function createAbortedBeforeReplayError(): ApiClientError {
  const error = new Error('Request was cancelled before replay.');
  error.name = 'AbortError';
  return createNetworkError(error);
}
