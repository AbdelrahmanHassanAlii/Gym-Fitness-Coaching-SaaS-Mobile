import {
  hasExplicitTimezoneOffset,
  isCoachingRelationshipStatus,
  type RelationshipId,
  type WorkspaceId,
} from '@/contracts';
import type { MobilePersona } from '@/navigation';
import {
  resolveUniqueMobileWorkspaceContext,
  type WorkspaceContextResolution,
} from '@/workspaceContext';

import type { StaffRelationshipDashboardDto, StaffRelationshipSummaryDto } from './contracts';

export type StaffWorkspaceResolution = WorkspaceContextResolution;
export type StaffPersona = Extract<MobilePersona, 'TRAINER' | 'ASSISTANT_TRAINER'>;

export function resolveTrainerAssistantWorkspaceContext(input: {
  generation: number;
  rows: Parameters<typeof resolveUniqueMobileWorkspaceContext>[0]['rows'];
}): StaffWorkspaceResolution {
  return resolveUniqueMobileWorkspaceContext({
    generation: input.generation,
    personas: ['TRAINER', 'ASSISTANT_TRAINER'],
    rows: input.rows,
  });
}

export function parseStaffRelationships(
  value: unknown,
  expected: { workspaceId: WorkspaceId },
): StaffRelationshipSummaryDto[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  const meta = (value as { meta?: unknown }).meta;
  if (!Array.isArray(data)) return null;
  if (meta !== undefined && (!meta || typeof meta !== 'object')) return null;

  const rows: StaffRelationshipSummaryDto[] = [];
  for (const item of data) {
    const row = parseStaffRelationship(item, expected);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function parseStaffRelationshipDashboard(
  value: unknown,
  expected: {
    workspaceId: WorkspaceId;
    relationshipId: RelationshipId;
    persona: StaffPersona;
  },
): StaffRelationshipDashboardDto | null {
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
  const relationship = candidate.relationship as { status?: unknown };
  if (!isCoachingRelationshipStatus(relationship.status)) return null;
  if (!Array.isArray(candidate.assignedStaff)) return null;
  if (!candidate.access || typeof candidate.access !== 'object') return null;
  const access = candidate.access as { actorKind?: unknown; sections?: unknown };
  const expectedActor = expected.persona === 'TRAINER' ? 'TRAINER' : 'ASSISTANT_TRAINER';
  if (access.actorKind !== expectedActor) return null;
  if (!access.sections || typeof access.sections !== 'object') return null;

  return data as StaffRelationshipDashboardDto;
}

function parseStaffRelationship(
  value: unknown,
  expected: { workspaceId: WorkspaceId },
): StaffRelationshipSummaryDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    id?: unknown;
    workspaceId?: unknown;
    traineeUserId?: unknown;
    traineeMembershipId?: unknown;
    homeBranchId?: unknown;
    status?: unknown;
    version?: unknown;
    createdAt?: unknown;
    updatedAt?: unknown;
  };

  if (!nonEmptyString(candidate.id)) return null;
  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (!nonEmptyString(candidate.traineeUserId)) return null;
  if (
    candidate.traineeMembershipId !== undefined &&
    candidate.traineeMembershipId !== null &&
    !nonEmptyString(candidate.traineeMembershipId)
  ) {
    return null;
  }
  if (
    candidate.homeBranchId !== undefined &&
    candidate.homeBranchId !== null &&
    !nonEmptyString(candidate.homeBranchId)
  ) {
    return null;
  }
  if (!isCoachingRelationshipStatus(candidate.status)) return null;
  if (typeof candidate.version !== 'number') return null;
  if (!hasExplicitTimezoneOffset(candidate.createdAt)) return null;
  if (!hasExplicitTimezoneOffset(candidate.updatedAt)) return null;

  return value as StaffRelationshipSummaryDto;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
