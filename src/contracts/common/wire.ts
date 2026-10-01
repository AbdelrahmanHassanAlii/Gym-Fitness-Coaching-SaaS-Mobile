export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type ApiId = Brand<string, 'ApiId'>;
export type UserId = Brand<string, 'UserId'>;
export type WorkspaceId = Brand<string, 'WorkspaceId'>;
export type WorkspaceMembershipId = Brand<string, 'WorkspaceMembershipId'>;
export type RelationshipId = Brand<string, 'RelationshipId'>;
export type BranchId = Brand<string, 'BranchId'>;
export type FileId = Brand<string, 'FileId'>;
export type DocumentId = Brand<string, 'DocumentId'>;
export type NotificationId = Brand<string, 'NotificationId'>;
export type PushDeviceId = Brand<string, 'PushDeviceId'>;

export type ApiDateOnly = Brand<string, 'ApiDateOnly'>;
export type ApiTimestamp = Brand<string, 'ApiTimestamp'>;
export type IanaTimezone = Brand<string, 'IanaTimezone'>;
export type Cursor = Brand<string, 'Cursor'>;
export type ExpectedVersion = Brand<number, 'ExpectedVersion'>;
export type IdempotencyKey = Brand<string, 'IdempotencyKey'>;

export const mobileActorRoles = [
  'TRAINEE',
  'TRAINER',
  'ASSISTANT_TRAINER',
  'NUTRITIONIST',
] as const;
export type MobileActorRole = (typeof mobileActorRoles)[number];

export const permissionScopes = [
  'SELF',
  'ASSIGNED_TRAINEES',
  'SPECIFIC_TRAINEES',
  'BRANCH',
  'MULTIPLE_BRANCHES',
  'WORKSPACE',
  'PLATFORM',
] as const;
export type PermissionScope = (typeof permissionScopes)[number];

export interface ApiEnvelope<TData> {
  data: TData;
}

export interface ApiPageInfo<TCursor extends string = Cursor> {
  hasMore?: boolean;
  nextCursor?: TCursor | null;
}

export interface ApiPage<TItem, TCursor extends string = Cursor> {
  data: TItem[];
  pageInfo?: ApiPageInfo<TCursor>;
  page?: { nextCursor?: TCursor | null };
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    correlationId?: string;
    details?: unknown;
  };
}

export type IdempotencyRequirement = 'REQUIRED' | 'NOT_REQUIRED' | 'NOT_APPLICABLE' | 'UNVERIFIED';
export type ContractConfidence =
  | 'VERIFIED_FROM_IMPLEMENTATION'
  | 'VERIFIED_FROM_OPENAPI_AND_IMPLEMENTATION'
  | 'DOCUMENTED_BEHAVIOR_NOT_FULLY_EXPRESSED_IN_OPENAPI'
  | 'PROVIDER_DEPENDENT'
  | 'UNVERIFIED_FOLLOW_UP';

export const isMobileActorRole = (value: unknown): value is MobileActorRole =>
  typeof value === 'string' && mobileActorRoles.includes(value as MobileActorRole);

export const isPermissionScope = (value: unknown): value is PermissionScope =>
  typeof value === 'string' && permissionScopes.includes(value as PermissionScope);

export const isApiDateOnly = (value: unknown): value is ApiDateOnly =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

export const hasExplicitTimezoneOffset = (value: unknown): value is ApiTimestamp =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value);

export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  if (!value || typeof value !== 'object') return false;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; message?: unknown };
  return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}
