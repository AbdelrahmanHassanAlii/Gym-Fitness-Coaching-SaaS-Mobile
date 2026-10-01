import type { RelationshipId } from '@/contracts';

export type QueryScope = 'public' | 'session';
export type QueryKeyPart = string | number | boolean | null | undefined;
export type QueryKeyFilters = Record<string, QueryKeyPart | readonly QueryKeyPart[]>;

export interface AppQueryKeyOptions {
  scope: QueryScope;
  entity: string;
  role?: string;
  relationshipId?: RelationshipId;
  filters?: QueryKeyFilters;
  page?: QueryKeyFilters;
}

const forbiddenKeyPattern = /(access|refresh)?token|secret|credential|authorization|signedurl/i;

export function appQueryKey(options: AppQueryKeyOptions): readonly unknown[] {
  assertSafeQueryKeyObject(options);

  return [
    options.scope,
    options.entity,
    {
      role: options.role,
      relationshipId: options.relationshipId,
      filters: normalizeKeyObject(options.filters),
      page: normalizeKeyObject(options.page),
    },
  ] as const;
}

export function assertSafeQueryKeyObject(value: unknown): void {
  if (!value || typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value)) {
    if (forbiddenKeyPattern.test(key)) {
      throw new Error(`Query key field "${key}" may contain sensitive data.`);
    }

    if (nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue)) {
      assertSafeQueryKeyObject(nestedValue);
    }
  }
}

function normalizeKeyObject(value?: QueryKeyFilters): QueryKeyFilters | undefined {
  if (!value) return undefined;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}
