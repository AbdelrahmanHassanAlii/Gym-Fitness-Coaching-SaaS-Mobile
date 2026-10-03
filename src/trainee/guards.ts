import {
  hasExplicitTimezoneOffset,
  type MyWorkspaceContextDto,
  type RelationshipId,
  type WorkspaceId,
} from '@/contracts';
import { isCoachingRelationshipStatus } from '@/contracts';

import { parseMyWorkspaceContexts, resolveSinglePersonaWorkspaceContext } from '@/workspaceContext';
import type { WorkspaceContextResolution } from '@/workspaceContext';
import type { TraineeRelationshipDashboardDto } from './contracts';

export { parseMyWorkspaceContexts };

export type TraineeContextResolution = WorkspaceContextResolution;

export function resolveTraineeWorkspaceContext(input: {
  generation: number;
  rows: readonly MyWorkspaceContextDto[];
}): TraineeContextResolution {
  return resolveSinglePersonaWorkspaceContext({
    generation: input.generation,
    persona: 'TRAINEE',
    rows: input.rows,
  });
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
