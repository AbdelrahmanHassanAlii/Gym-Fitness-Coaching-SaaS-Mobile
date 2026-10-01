export type QueryPrimitive = string | number | boolean;
export type QueryValue = QueryPrimitive | QueryPrimitive[] | null | undefined;
export type QueryParams = Record<string, QueryValue>;

const apiPrefix = '/api/v1';

export function composeApiUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = normalizeRelativePath(path);
  const url = new URL(`${normalizedBaseUrl}${apiPrefix}${normalizedPath}`);

  appendQuery(url.searchParams, query);

  return url.toString();
}

export function appendQuery(searchParams: URLSearchParams, query?: QueryParams): void {
  if (!query) return;

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;

    const values = Array.isArray(value) ? value : [value];
    for (const item of values) {
      searchParams.append(key, String(item));
    }
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Backend base URL is required.');

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Backend base URL must use http or https.');
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, '');
  parsed.search = '';
  parsed.hash = '';

  return parsed.toString().replace(/\/$/, '');
}

function normalizeRelativePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed.startsWith('/')) throw new Error('API path must start with /.');
  if (trimmed.startsWith('//')) throw new Error('API path must be relative to the configured Backend.');
  if (/^[a-z][a-z\d+\-.]*:\/\//i.test(trimmed)) {
    throw new Error('API path cannot be an absolute URL.');
  }

  return `/${trimmed.replace(/^\/+/, '')}`;
}
