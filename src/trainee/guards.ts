import {
  hasExplicitTimezoneOffset,
  isWorkspaceMembershipRole,
  type MyWorkspaceContextDto,
  type RelationshipId,
  type WorkspaceId,
} from '@/contracts';
import { isCoachingRelationshipStatus } from '@/contracts';

import type { NavigationWorkspaceContext } from '@/navigation';
import type { TraineeRelationshipDashboardDto } from './contracts';

export type TraineeContextResolution =
  | {
      status: 'ready';
      workspaceContext: NavigationWorkspaceContext;
      workspace: MyWorkspaceContextDto['workspace'];
      membership: MyWorkspaceContextDto['membership'];
    }
  | {
      status: 'unresolved';
      reason: 'no-trainee-workspace' | 'multiple-trainee-workspaces' | 'malformed-workspace-data';
    };

export function parseMyWorkspaceContexts(value: unknown): MyWorkspaceContextDto[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const rows: MyWorkspaceContextDto[] = [];
  for (const item of data) {
    const row = parseMyWorkspaceContext(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function resolveTraineeWorkspaceContext(input: {
  generation: number;
  rows: readonly MyWorkspaceContextDto[];
}): TraineeContextResolution {
  const candidates = input.rows.filter(
    (row) =>
      row.workspace.status === 'ACTIVE' &&
      row.membership.status === 'ACTIVE' &&
      row.membership.workspaceId === row.workspace.id &&
      row.membership.roles.includes('TRAINEE'),
  );

  if (candidates.length === 0) {
    return { status: 'unresolved', reason: 'no-trainee-workspace' };
  }
  if (candidates.length > 1) {
    return { status: 'unresolved', reason: 'multiple-trainee-workspaces' };
  }

  const selected = candidates[0];
  return {
    status: 'ready',
    workspace: selected.workspace,
    membership: selected.membership,
    workspaceContext: {
      generation: input.generation,
      workspaceId: selected.workspace.id,
      membershipId: selected.membership.id,
      roles: selected.membership.roles,
      preferredPersona: 'TRAINEE',
    },
  };
}

export function parseRelationshipDashboard(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): TraineeRelationshipDashboardDto | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const candidate = data as {
    workspaceId?: unknown;
    relationshipId?: unknown;
    generatedAt?: unknown;
    relationship?: unknown;
    assignedStaff?: unknown;
    access?: unknown;
  };
  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!hasExplicitTimezoneOffset(candidate.generatedAt)) return null;
  if (!candidate.relationship || typeof candidate.relationship !== 'object') return null;
  const relationship = candidate.relationship as { status?: unknown; homeBranchId?: unknown };
  if (!isCoachingRelationshipStatus(relationship.status)) return null;
  if (!Array.isArray(candidate.assignedStaff)) return null;
  if (!candidate.access || typeof candidate.access !== 'object') return null;
  const access = candidate.access as { actorKind?: unknown; sections?: unknown };
  if (access.actorKind !== 'TRAINEE') return null;
  if (!access.sections || typeof access.sections !== 'object') return null;

  return data as TraineeRelationshipDashboardDto;
}

function parseMyWorkspaceContext(value: unknown): MyWorkspaceContextDto | null {
  if (!value || typeof value !== 'object') return null;
  const workspace = (value as { workspace?: unknown }).workspace;
  const membership = (value as { membership?: unknown }).membership;
  if (!workspace || typeof workspace !== 'object') return null;
  if (!membership || typeof membership !== 'object') return null;

  const workspaceDto = workspace as {
    id?: unknown;
    type?: unknown;
    name?: unknown;
    ownerUserId?: unknown;
    status?: unknown;
    timezone?: unknown;
    defaultLanguage?: unknown;
  };
  const membershipDto = membership as {
    id?: unknown;
    workspaceId?: unknown;
    userId?: unknown;
    roles?: unknown;
    status?: unknown;
    permissionProfileIds?: unknown;
    accessVersion?: unknown;
    joinedAt?: unknown;
    engagementPeriods?: unknown;
  };

  if (!nonEmptyString(workspaceDto.id)) return null;
  if (workspaceDto.type !== 'GYM' && workspaceDto.type !== 'INDEPENDENT_TRAINER') return null;
  if (!nonEmptyString(workspaceDto.name)) return null;
  if (!nonEmptyString(workspaceDto.ownerUserId)) return null;
  if (workspaceDto.status !== 'ACTIVE') return null;
  if (!nonEmptyString(workspaceDto.timezone)) return null;
  if (workspaceDto.defaultLanguage !== 'ar' && workspaceDto.defaultLanguage !== 'en') return null;

  if (!nonEmptyString(membershipDto.id)) return null;
  if (membershipDto.workspaceId !== workspaceDto.id) return null;
  if (!nonEmptyString(membershipDto.userId)) return null;
  if (!Array.isArray(membershipDto.roles)) return null;
  if (membershipDto.roles.some((role) => !isWorkspaceMembershipRole(role))) return null;
  if (membershipDto.status !== 'ACTIVE') return null;
  if (!Array.isArray(membershipDto.permissionProfileIds)) return null;
  if (typeof membershipDto.accessVersion !== 'number') return null;
  if (!hasExplicitTimezoneOffset(membershipDto.joinedAt)) return null;
  if (!Array.isArray(membershipDto.engagementPeriods)) return null;
  if (
    membershipDto.engagementPeriods.some((period) => {
      if (!period || typeof period !== 'object') return true;
      const candidate = period as { startedAt?: unknown; endedAt?: unknown };
      return (
        !hasExplicitTimezoneOffset(candidate.startedAt) ||
        (candidate.endedAt !== undefined &&
          candidate.endedAt !== null &&
          !hasExplicitTimezoneOffset(candidate.endedAt))
      );
    })
  ) {
    return null;
  }

  return value as MyWorkspaceContextDto;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
