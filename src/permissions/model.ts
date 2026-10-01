import type { ApiClientError } from '@/api';
import {
  isVerifiedMobilePermissionKey,
  type EffectivePermissionDecisionDto,
  type VerifiedMobilePermissionKey,
} from '@/contracts';
import type {
  BranchId,
  PermissionScope,
  RelationshipId,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceMembershipRole,
} from '@/contracts/common/wire';

export type AccessState = 'unresolved' | 'allowed' | 'denied' | 'unavailable';

export interface AccessDecision {
  state: AccessState;
  permission?: VerifiedMobilePermissionKey;
  reason:
    | 'allowed'
    | 'explicit-deny'
    | 'backend-denied'
    | 'relationship-denied'
    | 'unresolved'
    | 'stale-generation'
    | 'unknown-permission'
    | 'malformed-access-fact'
    | 'access-data-failed'
    | 'missing-context'
    | 'branch-context-unverified'
    | 'relationship-context-unverified'
    | 'no-verified-allow';
  backendStatus?: number;
  backendCode?: string;
}

export interface PermissionAccessFacts {
  generation: number;
  workspaceId?: WorkspaceId;
  membershipId?: WorkspaceMembershipId;
  roles?: WorkspaceMembershipRole[];
  restrictedUntilVerified?: boolean;
  decisions?: EffectivePermissionDecisionDto[];
  branchAccess?: {
    includeBranchIds?: BranchId[];
    excludeBranchIds?: BranchId[];
  };
  relationshipAccess?: {
    includeRelationshipIds?: RelationshipId[];
    excludeRelationshipIds?: RelationshipId[];
    assignedTrainees?: boolean;
    self?: boolean;
  };
  loadError?: unknown;
}

export interface AccessRequest {
  permission: VerifiedMobilePermissionKey | string;
  currentGeneration: number | null;
  facts?: PermissionAccessFacts | null;
  workspaceId?: WorkspaceId;
  branchId?: BranchId;
  relationshipId?: RelationshipId;
}

export const unresolvedAccessDecision: AccessDecision = {
  state: 'unresolved',
  reason: 'unresolved',
};

export function resolveAccessDecision({
  permission,
  currentGeneration,
  facts,
  workspaceId,
  branchId,
  relationshipId,
}: AccessRequest): AccessDecision {
  if (!isVerifiedMobilePermissionKey(permission)) {
    return { state: 'unavailable', reason: 'unknown-permission' };
  }
  if (!facts || currentGeneration === null) {
    return { state: 'unresolved', permission, reason: 'unresolved' };
  }
  if (facts.generation !== currentGeneration) {
    return { state: 'unresolved', permission, reason: 'stale-generation' };
  }
  if (facts.loadError) {
    return { state: 'unavailable', permission, reason: 'access-data-failed' };
  }
  if (workspaceId && facts.workspaceId && workspaceId !== facts.workspaceId) {
    return { state: 'unresolved', permission, reason: 'missing-context' };
  }

  const matchingPermission = (facts.decisions ?? []).filter(
    (decision) => decision.permission === permission,
  );
  if (matchingPermission.some(isMalformedDecision)) {
    return { state: 'unavailable', permission, reason: 'malformed-access-fact' };
  }

  const matching = selectMostSpecificApplicableDecisions(matchingPermission, {
    branchId,
    relationshipId,
  });
  if (matching.length === 0) {
    return { state: 'denied', permission, reason: 'no-verified-allow' };
  }
  if (matching.some((decision) => decision.effect === 'DENY' || decision.explicitDeny)) {
    return { state: 'denied', permission, reason: 'explicit-deny' };
  }
  if (!matching.some((decision) => decision.allowed === true && decision.effect === 'ALLOW')) {
    return { state: 'denied', permission, reason: 'no-verified-allow' };
  }

  const branchDecision = evaluateBranchContext(branchId, facts);
  if (branchDecision) return { ...branchDecision, permission };

  const relationshipDecision = evaluateRelationshipContext(relationshipId, facts);
  if (relationshipDecision) return { ...relationshipDecision, permission };

  return { state: 'allowed', permission, reason: 'allowed' };
}

export function accessDecisionFromApiError(error: unknown): AccessDecision | null {
  if (!isApiClientLike(error)) return null;
  if (error.status !== 403) return null;

  if (error.kind === 'relationship_access') {
    return {
      state: 'denied',
      reason: 'relationship-denied',
      backendStatus: 403,
      backendCode: error.code,
    };
  }

  if (error.kind === 'permission') {
    return {
      state: 'denied',
      reason: 'backend-denied',
      backendStatus: 403,
      backendCode: error.code,
    };
  }

  return null;
}

export function isAccessAllowed(decision: AccessDecision): boolean {
  return decision.state === 'allowed';
}

export function roleContextHasRole(
  roles: readonly WorkspaceMembershipRole[] | undefined,
  role: WorkspaceMembershipRole,
): boolean {
  return roles?.includes(role) ?? false;
}

function isMalformedDecision(decision: EffectivePermissionDecisionDto): boolean {
  return (
    !isVerifiedMobilePermissionKey(decision.permission) ||
    (decision.effect !== 'ALLOW' && decision.effect !== 'DENY') ||
    typeof decision.allowed !== 'boolean' ||
    isContradictoryDecision(decision) ||
    isMalformedScope(decision.scope)
  );
}

function isContradictoryDecision(decision: EffectivePermissionDecisionDto): boolean {
  return (
    (decision.effect === 'ALLOW' && decision.allowed !== true) ||
    (decision.effect === 'DENY' && decision.allowed !== false)
  );
}

function isMalformedScope(scope: EffectivePermissionDecisionDto['scope']): boolean {
  if (!scope) return false;
  if (!isPermissionScopeType(scope.type)) return true;
  if (!scope.resourceIds) {
    return ['BRANCH', 'MULTIPLE_BRANCHES', 'SPECIFIC_TRAINEES'].includes(scope.type);
  }
  return !Array.isArray(scope.resourceIds) || scope.resourceIds.some((id) => typeof id !== 'string');
}

function isPermissionScopeType(value: unknown): value is PermissionScope {
  return (
    value === 'SELF' ||
    value === 'ASSIGNED_TRAINEES' ||
    value === 'SPECIFIC_TRAINEES' ||
    value === 'BRANCH' ||
    value === 'MULTIPLE_BRANCHES' ||
    value === 'WORKSPACE'
  );
}

function selectMostSpecificApplicableDecisions(
  decisions: EffectivePermissionDecisionDto[],
  context: Pick<AccessRequest, 'branchId' | 'relationshipId'>,
): EffectivePermissionDecisionDto[] {
  const applicable = decisions.filter((decision) => decisionAppliesToContext(decision, context));
  const highestSpecificity = Math.max(
    ...applicable.map((decision) => scopeSpecificity(decision.scope?.type)),
    -1,
  );
  return applicable.filter(
    (decision) => scopeSpecificity(decision.scope?.type) === highestSpecificity,
  );
}

function decisionAppliesToContext(
  decision: EffectivePermissionDecisionDto,
  { branchId, relationshipId }: Pick<AccessRequest, 'branchId' | 'relationshipId'>,
): boolean {
  const scope = decision.scope;
  if (!scope || scope.type === 'WORKSPACE') return true;

  if (scope.type === 'BRANCH' || scope.type === 'MULTIPLE_BRANCHES') {
    return Boolean(branchId && scope.resourceIds?.includes(branchId));
  }
  if (scope.type === 'SPECIFIC_TRAINEES') {
    return Boolean(relationshipId && scope.resourceIds?.includes(relationshipId));
  }

  // SELF and ASSIGNED_TRAINEES are Backend scope facts, but Mobile cannot prove a
  // specific relationship belongs to either set without explicit resolved access.
  return !branchId && !relationshipId;
}

function scopeSpecificity(scope: PermissionScope | undefined): number {
  if (scope === 'BRANCH' || scope === 'MULTIPLE_BRANCHES' || scope === 'SPECIFIC_TRAINEES') {
    return 2;
  }
  if (scope === 'SELF' || scope === 'ASSIGNED_TRAINEES') return 1;
  return 0;
}

function evaluateBranchContext(
  branchId: BranchId | undefined,
  facts: PermissionAccessFacts,
): AccessDecision | null {
  if (!branchId) return null;
  const access = facts.branchAccess;
  if (!access) return { state: 'unavailable', reason: 'branch-context-unverified' };
  if (access.excludeBranchIds?.includes(branchId)) {
    return { state: 'denied', reason: 'explicit-deny' };
  }
  if (access.includeBranchIds && access.includeBranchIds.length > 0) {
    return access.includeBranchIds.includes(branchId)
      ? null
      : { state: 'denied', reason: 'explicit-deny' };
  }
  return { state: 'unavailable', reason: 'branch-context-unverified' };
}

function evaluateRelationshipContext(
  relationshipId: RelationshipId | undefined,
  facts: PermissionAccessFacts,
): AccessDecision | null {
  if (!relationshipId) return null;
  const access = facts.relationshipAccess;
  if (!access) return { state: 'unavailable', reason: 'relationship-context-unverified' };
  if (access.excludeRelationshipIds?.includes(relationshipId)) {
    return { state: 'denied', reason: 'explicit-deny' };
  }
  if (access.includeRelationshipIds && access.includeRelationshipIds.length > 0) {
    return access.includeRelationshipIds.includes(relationshipId)
      ? null
      : { state: 'denied', reason: 'explicit-deny' };
  }
  return { state: 'unavailable', reason: 'relationship-context-unverified' };
}

function isApiClientLike(error: unknown): error is ApiClientError {
  if (!error || typeof error !== 'object') return false;
  return 'kind' in error && 'status' in error;
}
