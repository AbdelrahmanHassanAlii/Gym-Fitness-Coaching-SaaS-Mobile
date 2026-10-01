import type {
  ApiEnvelope,
  ApiId,
  BranchId,
  PermissionScope,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceMembershipRole,
} from '@/contracts/common/wire';

export const permissionEffects = ['ALLOW', 'DENY'] as const;
export type PermissionEffect = (typeof permissionEffects)[number];

export const permissionContexts = ['PLATFORM', 'WORKSPACE'] as const;
export type PermissionContext = (typeof permissionContexts)[number];

export const verifiedMobilePermissionKeys = [
  'workspace.read',
  'branches.read',
  'trainees.read',
  'trainees.update',
  'programs.read',
  'programs.create',
  'programs.update',
  'workouts.read',
  'workouts.create',
  'workouts.update',
  'workouts.complete',
  'nutrition.plans.read',
  'nutrition.plans.create',
  'nutrition.plans.update',
  'measurements.read',
  'measurements.create',
  'progress_photos.read',
  'health.read',
  'health.update',
  'health.food_allergies.read',
  'notes.read',
  'adherence.read',
  'adherence.update',
  'checkins.read',
  'checkins.submit',
  'checkins.review',
  'documents.read',
  'documents.upload',
  'files.download',
  'dashboard.trainer.read',
  'dashboard.relationship.read',
  'analytics.training.read',
  'analytics.progress.read',
  'analytics.nutrition.read',
  'analytics.adherence.read',
] as const;

export type VerifiedMobilePermissionKey = (typeof verifiedMobilePermissionKeys)[number];

export interface PermissionScopeDto {
  type: Exclude<PermissionScope, 'PLATFORM'>;
  resourceIds?: string[];
  requiresAssignment?: boolean;
}

export interface EffectivePermissionDecisionDto {
  permission: string;
  effect: PermissionEffect;
  allowed: boolean;
  source: 'EXPLICIT_GRANT' | 'PROFILE' | 'NONE';
  explicitOverrideApplied?: boolean;
  explicitDeny?: boolean;
  profileBaselineApplied?: boolean;
  scope?: PermissionScopeDto;
  reasons?: string[];
}

export interface EffectiveWorkspaceAccessDto {
  membershipId: WorkspaceMembershipId;
  workspaceId: WorkspaceId;
  accessVersion: number;
  profiles: {
    id: ApiId;
    name: string;
    roleKey?: string;
    version: number;
    status: 'ACTIVE' | 'ARCHIVED';
    contributes: boolean;
  }[];
  grants: {
    id: ApiId;
    permission: string;
    effect: PermissionEffect;
    scope: PermissionScopeDto;
    expiresAt?: string;
    createdAt: string;
  }[];
  permissions: EffectivePermissionDecisionDto[];
}

export interface WorkspaceAccessContextDto {
  workspaceId: WorkspaceId;
  membershipId: WorkspaceMembershipId;
  roles: WorkspaceMembershipRole[];
  workspaceAllowed?: boolean;
  assignedTrainees?: boolean;
  self?: boolean;
  includeBranchIds?: BranchId[];
  excludeBranchIds?: BranchId[];
  includeRelationshipIds?: string[];
  excludeRelationshipIds?: string[];
}

export type EffectiveWorkspaceAccessResponseDto = ApiEnvelope<EffectiveWorkspaceAccessDto>;

export const isVerifiedMobilePermissionKey = (
  value: unknown,
): value is VerifiedMobilePermissionKey =>
  typeof value === 'string' &&
  verifiedMobilePermissionKeys.includes(value as VerifiedMobilePermissionKey);

export const isPermissionEffect = (value: unknown): value is PermissionEffect =>
  typeof value === 'string' && permissionEffects.includes(value as PermissionEffect);
