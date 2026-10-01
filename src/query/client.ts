import {
  QueryClient,
  type DefaultOptions,
  type Query,
} from '@tanstack/react-query';

import { isApiClientError } from '@/api';

export const protectedQueryScope = 'session';
export const publicQueryScope = 'public';

const nonRetryableStatuses = new Set([400, 401, 403, 404, 409, 422]);
const retryableServerStatuses = new Set([408, 429, 500, 502, 503, 504]);

export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;

  if (!isApiClientError(error)) return true;
  if (error.kind === 'network') return true;
  if (!error.status) return false;
  if (nonRetryableStatuses.has(error.status)) return false;

  return retryableServerStatuses.has(error.status);
}

export const appQueryDefaults: DefaultOptions = {
  queries: {
    retry: shouldRetryQuery,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  },
  mutations: {
    retry: false,
  },
};

export function createAppQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: appQueryDefaults,
  });
}

export const appQueryClient = createAppQueryClient();

export function isProtectedQuery(query: Query): boolean {
  return query.queryKey[0] === protectedQueryScope;
}

export function clearProtectedQueryCache(queryClient: QueryClient = appQueryClient): void {
  queryClient.removeQueries({ predicate: isProtectedQuery });
}
