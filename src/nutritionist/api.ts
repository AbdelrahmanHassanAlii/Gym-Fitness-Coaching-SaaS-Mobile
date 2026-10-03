import { createMalformedResponseError, type ApiClient } from '@/api';
import type { RelationshipId, WorkspaceId } from '@/contracts';

import type {
  NutritionAnalyticsDto,
  NutritionAnalyticsResponseDto,
  NutritionistRelationshipDashboardDto,
  NutritionistRelationshipDashboardResponseDto,
  NutritionistRelationshipListResponseDto,
  NutritionistRelationshipSummaryDto,
  NutritionPlanListResponseDto,
  NutritionPlanSummaryDto,
} from './contracts';
import {
  parseNutritionAnalytics,
  parseNutritionistRelationshipDashboard,
  parseNutritionistRelationships,
  parseNutritionPlanList,
} from './guards';

export async function fetchNutritionistRelationships(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  signal?: AbortSignal;
}): Promise<NutritionistRelationshipSummaryDto[]> {
  const response = await input.apiClient.request<NutritionistRelationshipListResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships`,
    signal: input.signal,
  });
  const parsed = parseNutritionistRelationships(response, { workspaceId: input.workspaceId });
  if (!parsed) throw createMalformedResponseError('Nutritionist relationships response was malformed.');
  return parsed;
}

export async function fetchNutritionistRelationshipDashboard(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  signal?: AbortSignal;
}): Promise<NutritionistRelationshipDashboardDto> {
  const response = await input.apiClient.request<NutritionistRelationshipDashboardResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
      input.relationshipId,
    )}/dashboard`,
    signal: input.signal,
  });
  const parsed = parseNutritionistRelationshipDashboard(response, {
    workspaceId: input.workspaceId,
    relationshipId: input.relationshipId,
  });
  if (!parsed) {
    throw createMalformedResponseError('Nutritionist relationship dashboard response was malformed.');
  }
  return parsed;
}

export async function fetchNutritionistNutritionPlans(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  signal?: AbortSignal;
}): Promise<NutritionPlanSummaryDto[]> {
  const response = await input.apiClient.request<
    NutritionPlanListResponseDto,
    { limit: number; includeArchived: boolean }
  >({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
      input.relationshipId,
    )}/nutrition-plans`,
    query: { limit: 10, includeArchived: false },
    signal: input.signal,
  });
  const parsed = parseNutritionPlanList(response, {
    workspaceId: input.workspaceId,
    relationshipId: input.relationshipId,
  });
  if (!parsed) throw createMalformedResponseError('Nutrition plans response was malformed.');
  return parsed;
}

export async function fetchNutritionistNutritionAnalytics(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  signal?: AbortSignal;
}): Promise<NutritionAnalyticsDto> {
  const response = await input.apiClient.request<NutritionAnalyticsResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
      input.relationshipId,
    )}/analytics/nutrition`,
    signal: input.signal,
  });
  const parsed = parseNutritionAnalytics(response, {
    workspaceId: input.workspaceId,
    relationshipId: input.relationshipId,
  });
  if (!parsed) throw createMalformedResponseError('Nutrition analytics response was malformed.');
  return parsed;
}
