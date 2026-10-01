import type { ApiErrorBody } from '@/contracts';

export type ApiErrorKind =
  | 'validation'
  | 'authentication'
  | 'permission'
  | 'relationship_access'
  | 'not_found'
  | 'expected_version_conflict'
  | 'idempotency_conflict'
  | 'subscription_or_entitlement'
  | 'quota'
  | 'file_or_provider'
  | 'network'
  | 'abort'
  | 'malformed_response'
  | 'http';

export type ApiErrorSource = 'backend' | 'network' | 'transport';

export interface ApiErrorOptions {
  kind: ApiErrorKind;
  source: ApiErrorSource;
  message: string;
  status?: number;
  code?: string;
  correlationId?: string;
  details?: unknown;
  cause?: unknown;
}

export class ApiClientError extends Error {
  readonly kind: ApiErrorKind;
  readonly source: ApiErrorSource;
  readonly status?: number;
  readonly code?: string;
  readonly correlationId?: string;
  readonly details?: unknown;
  override readonly cause?: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.message);
    this.name = 'ApiClientError';
    this.kind = options.kind;
    this.source = options.source;
    this.status = options.status;
    this.code = options.code;
    this.correlationId = options.correlationId;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isApiClientError(value: unknown): value is ApiClientError {
  return value instanceof ApiClientError;
}

export function createBackendError(status: number, body: ApiErrorBody): ApiClientError {
  const { code, message, correlationId, details } = body.error;

  return new ApiClientError({
    kind: classifyBackendError(status, code),
    source: 'backend',
    message,
    status,
    code,
    correlationId,
    details,
  });
}

export function createHttpError(status: number, message: string): ApiClientError {
  return new ApiClientError({
    kind: status === 401 ? 'authentication' : 'http',
    source: 'backend',
    message,
    status,
  });
}

export function createMalformedResponseError(message: string, cause?: unknown): ApiClientError {
  return new ApiClientError({
    kind: 'malformed_response',
    source: 'transport',
    message,
    cause,
  });
}

export function createNetworkError(error: unknown): ApiClientError {
  if (isAbortError(error)) {
    return new ApiClientError({
      kind: 'abort',
      source: 'network',
      message: 'The request was cancelled.',
      cause: error,
    });
  }

  return new ApiClientError({
    kind: 'network',
    source: 'network',
    message: 'The request failed before a valid response was received.',
    cause: error,
  });
}

function classifyBackendError(status: number, code: string): ApiErrorKind {
  if (status === 401 || code.includes('AUTH') || code.includes('SESSION')) return 'authentication';
  if (status === 404 || code.includes('NOT_FOUND')) return 'not_found';
  if (code.includes('EXPECTED_VERSION') || code.includes('VERSION_CONFLICT')) {
    return 'expected_version_conflict';
  }
  if (code.includes('IDEMPOTENCY')) return 'idempotency_conflict';
  if (code.includes('RELATIONSHIP') && (status === 403 || code.includes('ACCESS'))) {
    return 'relationship_access';
  }
  if (status === 403 || code.includes('PERMISSION') || code.includes('ACCESS_DENIED')) {
    return 'permission';
  }
  if (code.includes('SUBSCRIPTION') || code.includes('ENTITLEMENT')) {
    return 'subscription_or_entitlement';
  }
  if (code.includes('QUOTA')) return 'quota';
  if (
    code.includes('FILE') ||
    code.includes('DOCUMENT') ||
    code.includes('UPLOAD') ||
    code.includes('PROVIDER') ||
    code.includes('CHECKSUM') ||
    code.includes('STORAGE')
  ) {
    return 'file_or_provider';
  }
  if (status === 400 || status === 422 || code.includes('VALIDATION')) return 'validation';

  return 'http';
}

function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  return (
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}
