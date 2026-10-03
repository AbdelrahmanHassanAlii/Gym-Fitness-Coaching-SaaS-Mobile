import type { ApiClient } from '@/api';
import type { RelationshipId, WorkspaceId } from '@/contracts';

import type {
  StaffRelationshipDashboardDto,
  StaffRelationshipDashboardResponseDto,
  StaffRelationshipListResponseDto,
  StaffRelationshipSummaryDto,
} from './contracts';
import {
  parseStaffRelationshipDashboard,
  parseStaffRelationships,
  type StaffPersona,
} from './guards';

export async function fetchStaffRelationships(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  signal?: AbortSignal;
}): Promise<StaffRelationshipSummaryDto[]> {
  const response = await input.apiClient.request<StaffRelationshipListResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships`,
    signal: input.signal,
  });
  const parsed = parseStaffRelationships(response, { workspaceId: input.workspaceId });
  if (!parsed) throw malformed('Staff relationships response was malformed.');
  return parsed;
}

export async function fetchStaffRelationshipDashboard(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  persona: StaffPersona;
  signal?: AbortSignal;
}): Promise<StaffRelationshipDashboardDto> {
  const response = await input.apiClient.request<StaffRelationshipDashboardResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
      input.relationshipId,
    )}/dashboard`,
    signal: input.signal,
  });
  const parsed = parseStaffRelationshipDashboard(response, {
    workspaceId: input.workspaceId,
    relationshipId: input.relationshipId,
    persona: input.persona,
  });
  if (!parsed) throw malformed('Staff relationship dashboard response was malformed.');
  return parsed;
}

function malformed(message: string): Error {
  const error = new Error(message);
  error.name = 'MalformedStaffExperienceResponseError';
  return error;
}
