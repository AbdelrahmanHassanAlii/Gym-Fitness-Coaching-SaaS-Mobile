import type { QueryFunctionContext, QueryKey } from '@tanstack/react-query';

import type { ApiClient, ApiRequestOptions, QueryParams } from '@/api';

export type ApiQueryRequestBuilder<
  TQueryKey extends QueryKey,
  TQuery extends QueryParams | undefined,
  TBody,
> = (
  context: QueryFunctionContext<TQueryKey>,
) => Omit<ApiRequestOptions<TQuery, TBody>, 'signal'>;

export function createApiQueryFn<
  TResponse,
  TQueryKey extends QueryKey = QueryKey,
  TQuery extends QueryParams | undefined = undefined,
  TBody = undefined,
>(
  apiClient: ApiClient,
  buildRequest: ApiQueryRequestBuilder<TQueryKey, TQuery, TBody>,
) {
  return async (context: QueryFunctionContext<TQueryKey>): Promise<TResponse> =>
    await apiClient.request<TResponse, TQuery, TBody>({
      ...buildRequest(context),
      signal: context.signal,
    });
}
