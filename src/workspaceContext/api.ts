import type { ApiClient } from '@/api';
import type { MyWorkspaceContextDto, MyWorkspacesResponseDto } from '@/contracts';

import { parseMyWorkspaceContexts } from './guards';

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

function malformed(message: string): Error {
  const error = new Error(message);
  error.name = 'MalformedWorkspaceContextResponseError';
  return error;
}
