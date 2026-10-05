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
import { createAppQueryClient, protectedQueryScope } from '@/query';
import { ThemeProvider } from '@/theme';
import {
  fetchStaffRelationshipDashboard,
  fetchStaffRelationships,
  parseStaffRelationshipDashboard,
  parseStaffRelationships,
  resolveTrainerAssistantWorkspaceContext,
  StaffExperienceScreen,
  staffRelationshipDashboardKey,
  staffRelationshipsKey,
} from '@/trainerAssistant';

const workspaceId = 'workspace-1' as WorkspaceId;
const workspaceB = 'workspace-2' as WorkspaceId;
const membershipId = 'membership-1' as WorkspaceMembershipId;
const assistantMembershipId = 'membership-2' as WorkspaceMembershipId;
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
      userId: 'staff-1' as never,
      roles: ['TRAINER'],
      status: 'ACTIVE',
      permissionProfileIds: [],
      accessVersion: 7,
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

function dashboard(actorKind: 'TRAINER' | 'ASSISTANT_TRAINER' = 'TRAINER', id = relationshipA) {
  return {
    data: {
      workspaceId,
      relationshipId: id,
      generatedAt: '2026-01-02T08:00:00.000Z',
      relationship: { status: 'ACTIVE', traineeUserId: 'trainee-1', homeBranchId: null },
      assignedStaff: [{ assignmentType: 'PRIMARY_TRAINER', startedAt: '2026-01-01T08:00:00.000Z' }],
      training: { summary: { completedSessions: 5 } },
      nutrition: null,
      progress: null,
      checkIns: { dueCount: 2, submittedOrReviewedCount: 1, complianceRate: 0.5 },
      adherence: null,
      needsAttention: null,
      access: {
        actorKind,
        sections: { training: true, nutrition: false, progress: true, checkIns: true },
      },
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
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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

describe('MOB-013 trainer and assistant workspace context', () => {
  it('selects one verified TRAINER workspace without making the role an authorization grant', () => {
    const resolved = resolveTrainerAssistantWorkspaceContext({
      generation: 3,
      rows: [workspaceRow()],
    });

    expect(resolved).toMatchObject({
      status: 'ready',
      workspaceContext: {
        generation: 3,
        workspaceId,
        membershipId,
        roles: ['TRAINER'],
        preferredPersona: 'TRAINER',
      },
    });
  });

  it('supports Assistant Trainer as a distinct persona without inheriting Trainer authorization', () => {
    const resolved = resolveTrainerAssistantWorkspaceContext({
      generation: 4,
      rows: [
        workspaceRow({
          membership: {
            ...workspaceRow().membership,
            id: assistantMembershipId,
            roles: ['ASSISTANT_TRAINER'],
          },
        }),
      ],
    });

    expect(resolved).toMatchObject({
      status: 'ready',
      workspaceContext: {
        preferredPersona: 'ASSISTANT_TRAINER',
        membershipId: assistantMembershipId,
      },
    });
  });

  it('fails closed for multiple staff workspaces, multi-role ambiguity, and non-staff roles', () => {
    expect(
      resolveTrainerAssistantWorkspaceContext({
        generation: 1,
        rows: [
          workspaceRow(),
          workspaceRow({
            workspace: { ...workspaceRow().workspace, id: workspaceB, name: 'Alex Strength' },
            membership: { ...workspaceRow().membership, id: assistantMembershipId, workspaceId: workspaceB },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'multiple-matching-workspaces' });

    expect(
      resolveTrainerAssistantWorkspaceContext({
        generation: 1,
        rows: [
          workspaceRow({
            membership: { ...workspaceRow().membership, roles: ['TRAINER', 'ASSISTANT_TRAINER'] },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'multiple-matching-workspaces' });

    expect(
      resolveTrainerAssistantWorkspaceContext({
        generation: 1,
        rows: [workspaceRow({ membership: { ...workspaceRow().membership, roles: ['TRAINEE'] } })],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'no-matching-workspace' });
  });
});

describe('MOB-013 Backend contract calls and runtime guards', () => {
  it('calls the verified relationship list route with AbortSignal propagation', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const signal = new AbortController().signal;
    await fetchStaffRelationships({
      apiClient: fakeApiClient(listResponse(), calls),
      workspaceId,
      signal,
    });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/workspaces/workspace-1/relationships',
      signal,
    });
  });

  it('calls dashboard only with a coaching relationshipId from the verified relationship source', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    await fetchStaffRelationshipDashboard({
      apiClient: fakeApiClient(dashboard('TRAINER'), calls),
      workspaceId,
      relationshipId: relationshipA,
      persona: 'TRAINER',
    });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/workspaces/workspace-1/relationships/relationship-a/dashboard',
    });
  });

  it('rejects malformed lists and dashboard identity or actor mismatches', () => {
    expect(parseStaffRelationships({ data: [relationship(relationshipA, { workspaceId: workspaceB })] }, { workspaceId }))
      .toBeNull();
    expect(parseStaffRelationships({ data: [relationship(relationshipA, { traineeUserId: '' })] }, { workspaceId }))
      .toBeNull();
    expect(
      parseStaffRelationshipDashboard(dashboard('ASSISTANT_TRAINER'), {
        workspaceId,
        relationshipId: relationshipA,
        persona: 'TRAINER',
      }),
    ).toBeNull();
    expect(
      parseStaffRelationshipDashboard(
        { data: { ...dashboard('TRAINER').data, relationshipId: relationshipB } },
        { workspaceId, relationshipId: relationshipA, persona: 'TRAINER' },
      ),
    ).toBeNull();
  });

  it('uses generation/workspace/membership/persona/relationship query keys without credentials', () => {
    const context = resolveTrainerAssistantWorkspaceContext({ generation: 9, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    expect(staffRelationshipsKey(context)).toEqual([
      protectedQueryScope,
      9,
      'staff',
      'relationships',
      { workspaceId, membershipId, persona: 'TRAINER' },
    ]);
    expect(staffRelationshipDashboardKey(context, relationshipA)).toEqual([
      protectedQueryScope,
      9,
      'staff',
      'relationship-dashboard',
      { workspaceId, membershipId, persona: 'TRAINER', relationshipId: relationshipA },
    ]);
    expect(JSON.stringify(staffRelationshipDashboardKey(context, relationshipA))).not.toMatch(
      /accessToken|refreshToken|authorization/i,
    );
  });
});

describe('MOB-013 Trainer and Assistant UI', () => {
  it('renders Trainer home from Backend relationship list without invented metrics', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <StaffExperienceScreen
        apiClient={fakeApiClient(listResponse([relationship(relationshipA), relationship(relationshipB)]))}
        context={context}
        direction="ltr"
        routeKind="home"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('staff-home-summary')).toBeTruthy();
    });
    expect(screen.getByText('Trainer home')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByText(/score|streak|recommendation|unread|calorie/i)).toBeNull();
  });

  it('uses selected relationship row as the production relationshipId source for dashboard', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;
    const calls: ApiRequestOptions<never, never>[] = [];

    const screen = await renderWithProviders(
      <StaffExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          if (String(options.path).endsWith('/relationships')) return listResponse([relationship(relationshipA)]);
          return dashboard('TRAINER', relationshipA);
        }, calls)}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('staff-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));

    await waitFor(() => {
      expect(screen.getByTestId('staff-dashboard-summary')).toBeTruthy();
    });
    expect(calls.map((call) => call.path)).toContain(
      '/workspaces/workspace-1/relationships/relationship-a/dashboard',
    );
  });

  it('renders Assistant Trainer Arabic RTL without changing dashboard actor expectations', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({
      generation: 1,
      rows: [
        workspaceRow({
          membership: { ...workspaceRow().membership, roles: ['ASSISTANT_TRAINER'] },
        }),
      ],
    });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <StaffExperienceScreen
        apiClient={fakeApiClient(listResponse())}
        context={context}
        direction="rtl"
        routeKind="home"
        t={(key) => translate('ar', key)}
      />,
    );

    expect(screen.getByText('الرئيسية للمدرب المساعد')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('staff-home-summary')).toBeTruthy();
    });
  });

  it('treats 403/network failures as unavailable UI without logging out semantics', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
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
      <StaffExperienceScreen
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
    expect(screen.getByText('Relationships are unavailable.')).toBeTruthy();
  });

  it('does not treat list membership as authorization when Assistant dashboard actor kind mismatches', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({
      generation: 1,
      rows: [
        workspaceRow({
          membership: { ...workspaceRow().membership, roles: ['ASSISTANT_TRAINER'] },
        }),
      ],
    });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const screen = await renderWithProviders(
      <StaffExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          if (String(options.path).endsWith('/relationships')) return listResponse([relationship(relationshipA)]);
          return dashboard('TRAINER', relationshipA);
        })}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('staff-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
    expect(screen.getByText('Relationship dashboard is unavailable.')).toBeTruthy();
    expect(screen.queryByTestId('staff-dashboard-summary')).toBeNull();
  });

  it('keeps a late relationship A dashboard result from rendering after relationship B is selected', async () => {
    const context = resolveTrainerAssistantWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;
    const lateA = deferred<unknown>();

    const screen = await renderWithProviders(
      <StaffExperienceScreen
        apiClient={fakeApiClient((options: ApiRequestOptions<never, never>) => {
          const path = String(options.path);
          if (path.endsWith('/relationships')) {
            return listResponse([relationship(relationshipA), relationship(relationshipB)]);
          }
          if (path.endsWith('/relationship-a/dashboard')) return lateA.promise;
          return {
            data: {
              ...dashboard('TRAINER', relationshipB).data,
              training: { summary: { completedSessions: 8 } },
            },
          };
        })}
        context={context}
        direction="ltr"
        routeKind="relationships"
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('staff-relationship-list')).toBeTruthy();
    });
    await fireEvent.press(screen.getByRole('button', { name: /relationship-a/i }));
    await fireEvent.press(screen.getByRole('button', { name: /relationship-b/i }));

    await waitFor(() => {
      expect(screen.getByTestId('staff-dashboard-summary')).toBeTruthy();
      expect(screen.getByText('8')).toBeTruthy();
    });

    lateA.resolve(dashboard('TRAINER', relationshipA));
    await waitFor(() => {
      expect(screen.getByText('8')).toBeTruthy();
      expect(screen.queryByText('5')).toBeNull();
    });
  });
});
