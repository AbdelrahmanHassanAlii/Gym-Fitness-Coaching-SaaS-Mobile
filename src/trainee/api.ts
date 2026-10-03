import type { ApiClient } from '@/api';
import type {
  RelationshipId,
  WorkspaceId,
} from '@/contracts';
import { fetchMyWorkspaceContexts } from '@/workspaceContext';

import type {
  TraineeRelationshipDashboardDto,
  TraineeRelationshipDashboardResponseDto,
} from './contracts';
import { parseRelationshipDashboard } from './guards';

export { fetchMyWorkspaceContexts };

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
