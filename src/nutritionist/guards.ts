import {
  hasExplicitTimezoneOffset,
  isCoachingRelationshipStatus,
  type RelationshipId,
  type WorkspaceId,
} from '@/contracts';
import { isAnalyticsGranularity } from '@/contracts/analytics/dto';
import type { MobilePersona } from '@/navigation';
import {
  resolveUniqueMobileWorkspaceContext,
  type WorkspaceContextResolution,
} from '@/workspaceContext';

import type {
  NutritionAnalyticsDto,
  NutritionistRelationshipDashboardDto,
  NutritionistRelationshipSummaryDto,
  NutritionPlanStatus,
  NutritionPlanSummaryDto,
} from './contracts';

export type NutritionistWorkspaceResolution = WorkspaceContextResolution;
export type NutritionistPersona = Extract<MobilePersona, 'NUTRITIONIST'>;

const planStatuses = new Set<NutritionPlanStatus>([
  'DRAFT',
  'ACTIVE',
  'REPLACED',
  'COMPLETED',
  'ARCHIVED',
]);

export function resolveNutritionistWorkspaceContext(input: {
  generation: number;
  rows: Parameters<typeof resolveUniqueMobileWorkspaceContext>[0]['rows'];
}): NutritionistWorkspaceResolution {
  return resolveUniqueMobileWorkspaceContext({
    generation: input.generation,
    personas: ['NUTRITIONIST'],
    rows: input.rows,
  });
}

export function parseNutritionistRelationships(
  value: unknown,
  expected: { workspaceId: WorkspaceId },
): NutritionistRelationshipSummaryDto[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  const meta = (value as { meta?: unknown }).meta;
  if (!Array.isArray(data)) return null;
  if (meta !== undefined && (!meta || typeof meta !== 'object')) return null;

  const rows: NutritionistRelationshipSummaryDto[] = [];
  for (const item of data) {
    const row = parseRelationship(item, expected);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function parseNutritionistRelationshipDashboard(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): NutritionistRelationshipDashboardDto | null {
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
    nutrition?: unknown;
  };

  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!hasExplicitTimezoneOffset(candidate.generatedAt)) return null;
  if (!candidate.relationship || typeof candidate.relationship !== 'object') return null;
  if (!isCoachingRelationshipStatus((candidate.relationship as { status?: unknown }).status)) {
    return null;
  }
  if (!Array.isArray(candidate.assignedStaff)) return null;
  if (!candidate.access || typeof candidate.access !== 'object') return null;
  if (!candidate.nutrition || typeof candidate.nutrition !== 'object') return null;

  const access = candidate.access as { actorKind?: unknown; sections?: unknown };
  if (access.actorKind !== 'NUTRITIONIST') return null;
  if (!access.sections || typeof access.sections !== 'object') return null;
  const sections = access.sections as Record<string, unknown>;
  if (sections.nutrition !== true) return null;
  if (sections.training === true || sections.progress === true || sections.checkIns === true) {
    return null;
  }

  return data as NutritionistRelationshipDashboardDto;
}

export function parseNutritionPlanList(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): NutritionPlanSummaryDto[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  const nextCursor = (value as { nextCursor?: unknown }).nextCursor;
  if (!Array.isArray(data)) return null;
  if (nextCursor !== undefined && nextCursor !== null && !nonEmptyString(nextCursor)) return null;

  const rows: NutritionPlanSummaryDto[] = [];
  for (const item of data) {
    const row = parsePlan(item, expected);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function parseNutritionAnalytics(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): NutritionAnalyticsDto | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  const candidate = data as {
    workspaceId?: unknown;
    relationshipId?: unknown;
    range?: unknown;
    granularity?: unknown;
    activePlan?: unknown;
    targets?: unknown;
    nutritionTracking?: unknown;
    waterTracking?: unknown;
    series?: unknown;
  };

  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!parseAnalyticsRange(candidate.range)) return null;
  if (candidate.granularity !== undefined && !isAnalyticsGranularity(candidate.granularity)) {
    return null;
  }
  if (
    candidate.activePlan !== null &&
    candidate.activePlan !== undefined &&
    !parseActivePlan(candidate.activePlan)
  ) {
    return null;
  }
  if (candidate.targets !== null && candidate.targets !== undefined && !isObject(candidate.targets)) {
    return null;
  }
  if (!parseNutritionTracking(candidate.nutritionTracking)) return null;
  if (!parseWaterTracking(candidate.waterTracking)) return null;
  if (!Array.isArray(candidate.series)) return null;

  return data as NutritionAnalyticsDto;
}

function parseRelationship(
  value: unknown,
  expected: { workspaceId: WorkspaceId },
): NutritionistRelationshipSummaryDto | null {
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

  return value as NutritionistRelationshipSummaryDto;
}

function parsePlan(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): NutritionPlanSummaryDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as {
    id?: unknown;
    workspaceId?: unknown;
    relationshipId?: unknown;
    name?: unknown;
    status?: unknown;
    responsibleMembershipId?: unknown;
    currentRevisionId?: unknown;
    startedAt?: unknown;
    endedAt?: unknown;
    version?: unknown;
  };

  if (!nonEmptyString(candidate.id)) return null;
  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!nonEmptyString(candidate.name)) return null;
  if (typeof candidate.status !== 'string' || !planStatuses.has(candidate.status as NutritionPlanStatus)) {
    return null;
  }
  if (!nonEmptyString(candidate.responsibleMembershipId)) return null;
  if (!nonEmptyString(candidate.currentRevisionId)) return null;
  if (
    candidate.startedAt !== undefined &&
    candidate.startedAt !== null &&
    !hasExplicitTimezoneOffset(candidate.startedAt)
  ) {
    return null;
  }
  if (
    candidate.endedAt !== undefined &&
    candidate.endedAt !== null &&
    !hasExplicitTimezoneOffset(candidate.endedAt)
  ) {
    return null;
  }
  if (typeof candidate.version !== 'number') return null;
  return value as NutritionPlanSummaryDto;
}

function parseAnalyticsRange(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { from?: unknown; to?: unknown; timezone?: unknown };
  return (
    hasExplicitTimezoneOffset(candidate.from) &&
    hasExplicitTimezoneOffset(candidate.to) &&
    nonEmptyString(candidate.timezone)
  );
}

function parseActivePlan(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown; name?: unknown };
  return nonEmptyString(candidate.id) && nonEmptyString(candidate.name);
}

function parseNutritionTracking(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { daysTracked?: unknown; averageAdherenceRate?: unknown };
  return (
    typeof candidate.daysTracked === 'number' &&
    (candidate.averageAdherenceRate === null || typeof candidate.averageAdherenceRate === 'number')
  );
}

function parseWaterTracking(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { daysTracked?: unknown; averageMl?: unknown; targetMl?: unknown };
  return (
    typeof candidate.daysTracked === 'number' &&
    (candidate.averageMl === null || typeof candidate.averageMl === 'number') &&
    (candidate.targetMl === null || typeof candidate.targetMl === 'number')
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
