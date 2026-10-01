export type NextPageResolver<TPage, TPageParam> = (page: TPage) => TPageParam | null | undefined;

export interface InfinitePaginationOptions<TPage, TPageParam> {
  getNextPageParam: NextPageResolver<TPage, TPageParam>;
}

export function createInfinitePagination<TPage, TPageParam>({
  getNextPageParam,
}: InfinitePaginationOptions<TPage, TPageParam>) {
  return {
    getNextPageParam,
  };
}

export function preserveOpaqueCursor<TCursor extends string | null | undefined>(
  cursor: TCursor,
): TCursor {
  return cursor;
}
