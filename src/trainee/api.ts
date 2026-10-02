import type { ApiClient } from '@/api';
import type {
  MyWorkspaceContextDto,
  MyWorkspacesResponseDto,
  RelationshipId,
  WorkspaceId,
} from '@/contracts';

import type {
  TraineeRelationshipDashboardDto,
  TraineeRelationshipDashboardResponseDto,
} from './contracts';
import { parseMyWorkspaceContexts, parseRelationshipDashboard } from './guards';

export async function fetchMyWorkspaceContexts(input: {
  apiClient: ApiClient;
  signal?: AbortSignal;
}): Promise<MyWorkspaceContextDto[]> {
  const response = await input.apiClient.request<MyWorkspacesResponseDto>({
    method: 'GET',
    path: '/me/workspaces',
    signal: input.signal,
  });
  const parsed = parseMyWorkspaceContexts(response);
  if (!parsed) throw malformed('My workspace context response was malformed.');
  return parsed;
}

export async function fetchTraineeRelationshipDashboard(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  signal?: AbortSignal;
}): Promise<TraineeRelationshipDashboardDto> {
  const response = await input.apiClient.request<TraineeRelationshipDashboardResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
      input.relationshipId,
    )}/dashboard`,
    signal: input.signal,
  });
  const parsed = parseRelationshipDashboard(response, {
    workspaceId: input.workspaceId,
    relationshipId: input.relationshipId,
  });
  if (!parsed) throw malformed('Trainee relationship dashboard response was malformed.');
  return parsed;
}

function malformed(message: string): Error {
  const error = new Error(message);
  error.name = 'MalformedTraineeResponseError';
  return error;
}
