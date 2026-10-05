import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from '@jest/globals';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react-native';

import { createBackendError, type ApiClient, type ApiRequestOptions } from '@/api';
import type {
  MyWorkspaceContextDto,
  RelationshipId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import { translate } from '@/i18n/messages';
import {
  fetchNutritionistNutritionAnalytics,
  fetchNutritionistNutritionPlans,
  fetchNutritionistRelationshipDashboard,
  fetchNutritionistRelationships,
  NutritionistExperienceScreen,
  nutritionistNutritionAnalyticsKey,
  nutritionistNutritionPlansKey,
  nutritionistRelationshipDashboardKey,
  nutritionistRelationshipsKey,
  parseNutritionAnalytics,
  parseNutritionistRelationshipDashboard,
  parseNutritionistRelationships,
  parseNutritionPlanList,
  resolveNutritionistWorkspaceContext,
} from '@/nutritionist';
import { protectedQueryScope, createAppQueryClient, shouldRetryQuery } from '@/query';
import { ThemeProvider } from '@/theme';
import { resolveUniqueMobileWorkspaceContext } from '@/workspaceContext';

const workspaceId = 'workspace-1' as WorkspaceId;
const workspaceB = 'workspace-2' as WorkspaceId;
const membershipId = 'membership-1' as WorkspaceMembershipId;
const membershipB = 'membership-2' as WorkspaceMembershipId;
const relationshipA = 'relationship-a' as RelationshipId;
const relationshipB = 'relationship-b' as RelationshipId;
const testQueryClients = new Set<ReturnType<typeof createAppQueryClient>>();

afterEach(() => {
  cleanup();
  for (const client of testQueryClients) {
    client.clear();
  }
  testQueryClients.clear();
});

function workspaceRow(input: Partial<MyWorkspaceContextDto> = {}): MyWorkspaceContextDto {
  return {
    workspace: {
      id: workspaceId,
      type: 'GYM',
      name: 'Cairo Strength',
      ownerUserId: 'owner-1' as never,
      status: 'ACTIVE',
      timezone: 'Africa/Cairo' as never,
      defaultLanguage: 'en',
    },
    membership: {
      id: membershipId,
      workspaceId,
      userId: 'nutritionist-1' as never,
      roles: ['NUTRITIONIST'],
      status: 'ACTIVE',
      permissionProfileIds: [],
      accessVersion: 11,
      joinedAt: '2026-01-01T08:00:00.000Z' as never,
      engagementPeriods: [{ startedAt: '2026-01-01T08:00:00.000Z' as never }],
    },
    ...input,
  };
}

function relationship(id: RelationshipId = relationshipA, overrides: Record<string, unknown> = {}) {
  return {
    id,
    workspaceId,
    traineeUserId: 'trainee-1',
    traineeMembershipId: 'trainee-membership-1',
    homeBranchId: null,
    status: 'ACTIVE',
    version: 4,
    createdAt: '2026-01-01T08:00:00.000Z',
    updatedAt: '2026-01-02T08:00:00.000Z',
    ...overrides,
  };
}

function listResponse(items = [relationship()]) {
  return { data: items, meta: { hasMore: false, nextCursor: null } };
}

function dashboard(id = relationshipA, overrides: Record<string, unknown> = {}) {
  return {
    data: {
      workspaceId,
      relationshipId: id,
      generatedAt: '2026-01-02T08:00:00.000Z',
      relationship: { status: 'ACTIVE', homeBranchId: null },
      assignedStaff: [{ assignmentType: 'NUTRITIONIST', startedAt: '2026-01-01T08:00:00.000Z' }],
      training: null,
      nutrition: {
        activePlan: { id: 'plan-1', name: 'Balanced plan' },
        nutritionTracking: { daysTracked: 3, averageAdherenceRate: 0.8 },
        waterTracking: { daysTracked: 2, averageMl: 1900, targetMl: 2200 },
      },
      progress: null,
      checkIns: null,
      adherence: null,
      needsAttention: null,
      access: {
        actorKind: 'NUTRITIONIST',
        sections: { training: false, nutrition: true, progress: false, checkIns: false },
      },
      ...overrides,
    },
  };
}

function plansResponse(id = relationshipA) {
  return {
    data: [
      {
        id: 'plan-1',
        workspaceId,
        relationshipId: id,
        name: 'Balanced plan',
        status: 'ACTIVE',
        responsibleMembershipId: membershipId,
        currentRevisionId: 'revision-1',
        startedAt: '2026-01-01T08:00:00.000Z',
        endedAt: null,
        version: 2,
      },
    ],
    nextCursor: 'plan-1',
  };
}

function analyticsResponse(id = relationshipA, daysTracked = 3) {
  return {
    data: {
      workspaceId,
      relationshipId: id,
      range: {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T00:00:00.000Z',
        timezone: 'Africa/Cairo',
      },
      activePlan: { id: 'plan-1', name: 'Balanced plan' },
      targets: {
        targetCalories: 2200,
        targetProteinG: 140,
        targetCarbsG: 210,
        targetFatG: 70,
        waterTargetMl: 2200,
      },
      nutritionTracking: { daysTracked, averageAdherenceRate: 0.8 },
      waterTracking: { daysTracked: 2, averageMl: 1900, targetMl: 2200 },
      series: [],
    },
  };
}

function fakeApiClient(
  response: unknown | ((options: ApiRequestOptions<never, never>) => unknown),
  calls: ApiRequestOptions<never, never>[] = [],
): ApiClient {
  return {
    async request(options) {
      calls.push(options as ApiRequestOptions<never, never>);
      return (typeof response === 'function' ? response(options as never) : response) as never;
    },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

async function renderWithProviders(element: React.ReactElement) {
  const queryClient = createAppQueryClient();
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, gcTime: Infinity },
    mutations: { ...queryClient.getDefaultOptions().mutations, gcTime: Infinity },
  });
  testQueryClients.add(queryClient);
  return await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{element}</ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MOB-014 Nutritionist context selection', () => {
  it('selects one verified Nutritionist workspace without treating the role as authorization', () => {
    const resolved = resolveNutritionistWorkspaceContext({ generation: 7, rows: [workspaceRow()] });

    expect(resolved).toMatchObject({
      status: 'ready',
      workspaceContext: {
        generation: 7,
        workspaceId,
        membershipId,
        roles: ['NUTRITIONIST'],
        preferredPersona: 'NUTRITIONIST',
      },
    });
  });

  it('fails closed for multiple Nutritionist workspaces and keeps app-level multi-role ambiguity', () => {
    expect(
      resolveNutritionistWorkspaceContext({
        generation: 1,
        rows: [
          workspaceRow(),
          workspaceRow({
            workspace: { ...workspaceRow().workspace, id: workspaceB, name: 'Alex Strength' },
            membership: { ...workspaceRow().membership, id: membershipB, workspaceId: workspaceB },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'multiple-matching-workspaces' });

    expect(
      resolveUniqueMobileWorkspaceContext({
        generation: 1,
        personas: ['TRAINEE', 'TRAINER', 'ASSISTANT_TRAINER', 'NUTRITIONIST'],
        rows: [
          workspaceRow({
            membership: { ...workspaceRow().membership, roles: ['TRAINER', 'NUTRITIONIST'] },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'multiple-matching-workspaces' });

    expect(
      resolveNutritionistWorkspaceContext({
        generation: 1,
        rows: [workspaceRow({ membership: { ...workspaceRow().membership, roles: ['TRAINER'] } })],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'no-matching-workspace' });
  });
});

describe('MOB-014 Backend contract calls and runtime guards', () => {
  it('calls only verified Nutritionist read routes with AbortSignal propagation', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const signal = new AbortController().signal;
    await fetchNutritionistRelationships({
      apiClient: fakeApiClient(listResponse(), calls),
      workspaceId,
      signal,
    });
    await fetchNutritionistRelationshipDashboard({
      apiClient: fakeApiClient(dashboard(), calls),
      workspaceId,
      relationshipId: relationshipA,
      signal,
    });
    await fetchNutritionistNutritionPlans({
      apiClient: fakeApiClient(plansResponse(), calls),
      workspaceId,
      relationshipId: relationshipA,
      signal,
    });
    await fetchNutritionistNutritionAnalytics({
      apiClient: fakeApiClient(analyticsResponse(), calls),
      workspaceId,
      relationshipId: relationshipA,
      signal,
    });

    expect(calls).toEqual([
      expect.objectContaining({ method: 'GET', path: '/workspaces/workspace-1/relationships', signal }),
      expect.objectContaining({
        method: 'GET',
        path: '/workspaces/workspace-1/relationships/relationship-a/dashboard',
        signal,
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/workspaces/workspace-1/relationships/relationship-a/nutrition-plans',
        query: { limit: 10, includeArchived: false },
        signal,
      }),
      expect.objectContaining({
        method: 'GET',
        path: '/workspaces/workspace-1/relationships/relationship-a/analytics/nutrition',
        signal,
      }),
    ]);
  });

  it('rejects malformed discovery, actor mismatch, identity mismatch, and bad nutrition data', () => {
    expect(parseNutritionistRelationships({ data: [relationship(relationshipA, { workspaceId: workspaceB })] }, { workspaceId }))
      .toBeNull();
    expect(parseNutritionistRelationshipDashboard(dashboard(relationshipA, { access: { actorKind: 'TRAINER', sections: {} } }), { workspaceId, relationshipId: relationshipA }))
      .toBeNull();
    expect(parseNutritionistRelationshipDashboard(dashboard(relationshipB), { workspaceId, relationshipId: relationshipA }))
      .toBeNull();
    expect(parseNutritionPlanList(plansResponse(relationshipB), { workspaceId, relationshipId: relationshipA }))
      .toBeNull();
    expect(
      parseNutritionAnalytics(
        {
          data: {
            ...analyticsResponse().data,
            relationshipId: relationshipB,
          },
        },
        { workspaceId, relationshipId: relationshipA },
      ),
    ).toBeNull();
  });

  it('uses protected generation/workspace/membership/persona/relationship query keys without credentials', () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 9, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const keys = [
      nutritionistRelationshipsKey(context),
      nutritionistRelationshipDashboardKey(context, relationshipA),
      nutritionistNutritionPlansKey(context, relationshipA),
      nutritionistNutritionAnalyticsKey(context, relationshipA),
    ];

    expect(keys[0]).toEqual([
      protectedQueryScope,
      9,
      'nutritionist',
      'relationships',
      { workspaceId, membershipId, persona: 'NUTRITIONIST' },
    ]);
    expect(JSON.stringify(keys)).not.toMatch(/accessToken|refreshToken|authorization|supportSession/i);
  });
});

describe('MOB-014 Nutritionist UI', () => {
  it('renders Nutritionist home from Backend relationship discovery without invented metrics', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={fakeApiClient(listResponse([relationship(relationshipA), relationship(relationshipB)]))}
        context={context}
        direction="ltr"
        routeKind="home"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-home-summary')).toBeTruthy();
    });
    expect(screen.getByText('Nutritionist home')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText(/score|streak|recommendation|unread/i)).toBeNull();
  });

  it('uses selected relationship row as the production relationshipId source for read-only nutrition review', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;
    const calls: ApiRequestOptions<never, never>[] = [];

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          const path = String(options.path);
          if (path.endsWith('/relationships')) return listResponse([relationship(relationshipA)]);
          if (path.endsWith('/dashboard')) return dashboard(relationshipA);
          if (path.endsWith('/nutrition-plans')) return plansResponse(relationshipA);
          return analyticsResponse(relationshipA);
        }, calls)}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a ACTIVE/i }));

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-detail')).toBeTruthy();
    });
    expect(calls.map((call) => call.path)).toEqual(
      expect.arrayContaining([
        '/workspaces/workspace-1/relationships/relationship-a/dashboard',
        '/workspaces/workspace-1/relationships/relationship-a/nutrition-plans',
        '/workspaces/workspace-1/relationships/relationship-a/analytics/nutrition',
      ]),
    );
    expect(screen.getByText('nutrition')).toBeTruthy();
    expect(screen.getByText('Balanced plan')).toBeTruthy();
    expect(screen.getByText('Nutrition plans shown')).toBeTruthy();
    expect(screen.getByText('More nutrition plans may be available.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Training changes unavailable' }).props.accessibilityState)
      .toMatchObject({ disabled: true });
  });

  it('treats target endpoint 403 responses as unavailable without local relationship authorization', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          const path = String(options.path);
          if (path.endsWith('/relationships')) return listResponse([relationship(relationshipA)]);
          throw createBackendError(403, {
            error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
          });
        })}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a ACTIVE/i }));

    await waitFor(() => {
      expect(screen.getByText('Nutrition review is unavailable.')).toBeTruthy();
    });
  });

  it('keeps malformed protected nutrition responses fail-closed and non-retryable', async () => {
    let thrown: unknown;
    try {
      await fetchNutritionistNutritionPlans({
        apiClient: fakeApiClient({
          data: [
            {
              ...plansResponse().data[0],
              relationshipId: relationshipB,
            },
          ],
          nextCursor: 'plan-1',
        }),
        workspaceId,
        relationshipId: relationshipA,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toMatchObject({ kind: 'malformed_response' });
    expect(shouldRetryQuery(0, thrown)).toBe(false);
  });

  it('renders Arabic RTL Nutritionist screen with accessible selected relationship state', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={fakeApiClient(listResponse())}
        context={context}
        direction="rtl"
        routeKind="relationships"
        t={(key) => translate('ar', key)}
      />,
    );

    expect(screen.getByText('الرئيسية لأخصائي التغذية')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-list')).toBeTruthy();
    });
    const row = screen.getByRole('button', { name: /relationship-a ACTIVE/i });
    await fireEvent.press(row);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /relationship-a ACTIVE/i }).props.accessibilityState)
        .toMatchObject({ selected: true });
    });
  });

  it('shows unavailable UI for 403/network errors without modeling logout or local authorization', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;
    const apiClient: ApiClient = {
      async request() {
        throw createBackendError(403, {
          error: { code: 'PERMISSION_DENIED', message: 'Forbidden' },
        });
      },
    };

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={apiClient}
        context={context}
        direction="ltr"
        routeKind="home"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('Nutrition relationships are unavailable.')).toBeTruthy();
  });

  it('does not render stale relationship A nutrition detail after relationship B is selected', async () => {
    const context = resolveNutritionistWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;
    const lateA = deferred<unknown>();

    const screen = await renderWithProviders(
      <NutritionistExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          const path = String(options.path);
          if (path.endsWith('/relationships')) {
            return listResponse([relationship(relationshipA), relationship(relationshipB)]);
          }
          if (path.endsWith('/relationship-a/analytics/nutrition')) return lateA.promise;
          if (path.endsWith('/relationship-a/dashboard')) return dashboard(relationshipA);
          if (path.endsWith('/relationship-a/nutrition-plans')) return plansResponse(relationshipA);
          if (path.endsWith('/relationship-b/dashboard')) return dashboard(relationshipB);
          if (path.endsWith('/relationship-b/nutrition-plans')) return plansResponse(relationshipB);
          return analyticsResponse(relationshipB, 9);
        })}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a ACTIVE/i }));
    await fireEvent.press(screen.getByRole('button', { name: /relationship-b ACTIVE/i }));

    await waitFor(() => {
      expect(screen.getByTestId('nutritionist-relationship-detail')).toBeTruthy();
      expect(screen.getByText('9')).toBeTruthy();
    });

    lateA.resolve(analyticsResponse(relationshipA, 3));
    await waitFor(() => {
      expect(screen.getByText('9')).toBeTruthy();
      expect(screen.queryByText('3')).toBeNull();
    });
  });
});
