import { QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from '@jest/globals';
import { render, waitFor } from '@testing-library/react-native';

import type { ApiClient, ApiRequestOptions } from '@/api';
import type {
  MyWorkspaceContextDto,
  RelationshipId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import type { AuthState } from '@/auth';
import { translate } from '@/i18n/messages';
import { NavigationSurface } from '@/navigation';
import { createAppQueryClient, protectedQueryScope } from '@/query';
import { ThemeProvider } from '@/theme';
import {
  fetchMyWorkspaceContexts,
  fetchTraineeRelationshipDashboard,
  parseMyWorkspaceContexts,
  parseRelationshipDashboard,
  resolveTraineeWorkspaceContext,
  TraineeHomeScreen,
  traineeRelationshipDashboardKey,
} from '@/trainee';

const workspaceId = 'workspace-1' as WorkspaceId;
const workspaceB = 'workspace-2' as WorkspaceId;
const membershipId = 'membership-1' as WorkspaceMembershipId;
const relationshipId = 'relationship-1' as RelationshipId;
const testQueryClients = new Set<ReturnType<typeof createAppQueryClient>>();

afterEach(() => {
  for (const client of testQueryClients) {
    client.clear();
  }
  testQueryClients.clear();
});

const authenticated = (generation: number): AuthState => ({
  status: 'authenticated',
  session: {
    user: {
      id: 'user-1' as never,
      firstName: 'Trainee',
      lastName: 'One',
      emailVerified: true,
      phoneVerified: false,
    },
    restrictedUntilVerified: false,
    generation,
  },
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
      userId: 'user-1' as never,
      roles: ['TRAINEE'],
      status: 'ACTIVE',
      permissionProfileIds: [],
      accessVersion: 3,
      joinedAt: '2026-01-01T08:00:00.000Z' as never,
      engagementPeriods: [{ startedAt: '2026-01-01T08:00:00.000Z' as never }],
    },
    ...input,
  };
}

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      workspaceId,
      relationshipId,
      generatedAt: '2026-01-02T08:00:00.000Z',
      relationship: {
        status: 'ACTIVE',
        traineeUserId: 'user-1',
        homeBranchId: null,
      },
      assignedStaff: [{ assignmentType: 'PRIMARY_TRAINER', startedAt: '2026-01-01T08:00:00.000Z' }],
      training: { summary: { completedSessions: 4 } },
      nutrition: { activePlan: { id: 'plan-1', name: 'Balanced plan' } },
      progress: null,
      checkIns: { dueCount: 1, submittedOrReviewedCount: 1, complianceRate: 1 },
      adherence: null,
      needsAttention: null,
      access: {
        actorKind: 'TRAINEE',
        sections: { training: true, nutrition: true, progress: true, checkIns: true },
      },
      ...overrides,
    },
  };
}

function fakeApiClient(response: unknown, calls: ApiRequestOptions<never, never>[] = []): ApiClient {
  return {
    async request(options) {
      calls.push(options as ApiRequestOptions<never, never>);
      return response as never;
    },
  };
}

async function renderWithProviders(element: React.ReactElement) {
  const queryClient = createAppQueryClient();
  testQueryClients.add(queryClient);
  return await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>{element}</ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('MOB-012 trainee context selection', () => {
  it('selects exactly one active TRAINEE workspace without treating the role as authorization', () => {
    const resolved = resolveTraineeWorkspaceContext({
      generation: 7,
      rows: [workspaceRow()],
    });

    expect(resolved).toMatchObject({
      status: 'ready',
      workspaceContext: {
        generation: 7,
        workspaceId,
        membershipId,
        roles: ['TRAINEE'],
        preferredPersona: 'TRAINEE',
      },
    });
  });

  it('fails closed for non-trainee, malformed, or multiple trainee workspace contexts', () => {
    expect(
      resolveTraineeWorkspaceContext({
        generation: 1,
        rows: [workspaceRow({ membership: { ...workspaceRow().membership, roles: ['TRAINER'] } })],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'no-trainee-workspace' });

    expect(
      resolveTraineeWorkspaceContext({
        generation: 1,
        rows: [
          workspaceRow(),
          workspaceRow({
            workspace: { ...workspaceRow().workspace, id: workspaceB, name: 'Alex Strength' },
            membership: { ...workspaceRow().membership, id: 'membership-2' as never, workspaceId: workspaceB },
          }),
        ],
      }),
    ).toMatchObject({ status: 'unresolved', reason: 'multiple-trainee-workspaces' });
  });

  it('rejects malformed live workspace context before it can reach Trainee navigation', () => {
    expect(
      parseMyWorkspaceContexts({
        data: [
          workspaceRow({
            membership: { ...workspaceRow().membership, roles: ['TRAINEE', 'UNKNOWN_ROLE' as never] },
          }),
        ],
      }),
    ).toBeNull();

    expect(
      parseMyWorkspaceContexts({
        data: [
          workspaceRow({
            membership: {
              ...workspaceRow().membership,
              engagementPeriods: [{ startedAt: 'not-a-timestamp' as never }],
            },
          }),
        ],
      }),
    ).toBeNull();
  });
});

describe('MOB-012 Backend contract calls', () => {
  it('calls the verified /me/workspaces route with AbortSignal propagation', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    const signal = new AbortController().signal;
    await fetchMyWorkspaceContexts({
      apiClient: fakeApiClient({ data: [workspaceRow()] }, calls),
      signal,
    });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/me/workspaces', signal });
  });

  it('calls the verified relationship dashboard route only with a relationshipId seam', async () => {
    const calls: ApiRequestOptions<never, never>[] = [];
    await fetchTraineeRelationshipDashboard({
      apiClient: fakeApiClient(dashboard(), calls),
      workspaceId,
      relationshipId,
    });

    expect(calls[0]).toMatchObject({
      method: 'GET',
      path: '/workspaces/workspace-1/relationships/relationship-1/dashboard',
    });
  });

  it('rejects malformed or mismatched dashboard data instead of showing stale relationship content', () => {
    expect(parseRelationshipDashboard(dashboard({ relationshipId: 'other' }), { workspaceId, relationshipId }))
      .toBeNull();
    expect(
      parseRelationshipDashboard(dashboard({ access: { actorKind: 'TRAINER', sections: {} } }), {
        workspaceId,
        relationshipId,
      }),
    ).toBeNull();
  });

  it('uses protected generation/workspace/membership/relationship query identity without credentials', () => {
    const context = resolveTraineeWorkspaceContext({ generation: 4, rows: [workspaceRow()] });
    expect(context.status).toBe('ready');
    if (context.status !== 'ready') return;

    const key = traineeRelationshipDashboardKey(context.workspaceContext, relationshipId);
    expect(key).toEqual([
      protectedQueryScope,
      4,
      'trainee',
      'relationship-dashboard',
      { workspaceId, membershipId, relationshipId },
    ]);
    expect(JSON.stringify(key)).not.toMatch(/accessToken|refreshToken|authorization/i);
  });
});

describe('MOB-012 Trainee Home rendering and navigation integration', () => {
  it('renders actual Trainee Home and omits future workflow tabs until their owning stages', async () => {
    const resolved = resolveTraineeWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(resolved.status).toBe('ready');
    if (resolved.status !== 'ready') return;

    const screen = await renderWithProviders(
      <NavigationSurface
        authState={authenticated(1)}
        direction="ltr"
        locale="en"
        renderAuth={() => null}
        renderRoute={({ route }) =>
          route.id === 'trainee.home' ? (
            <TraineeHomeScreen
              apiClient={fakeApiClient(dashboard())}
              context={resolved}
              direction="ltr"
              t={(key) => translate('en', key)}
            />
          ) : null
        }
        routes={[{ id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' }]}
        t={(key) => translate('en', key)}
        workspaceContext={resolved.workspaceContext}
      />,
    );

    expect(screen.getByText('Trainee home')).toBeTruthy();
    expect(screen.getAllByText('Cairo Strength')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Training' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Nutrition' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Progress' })).toBeNull();
  });

  it('renders Backend-provided relationship dashboard summary when a relationshipId is supplied', async () => {
    const resolved = resolveTraineeWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(resolved.status).toBe('ready');
    if (resolved.status !== 'ready') return;

    const screen = await renderWithProviders(
      <TraineeHomeScreen
        apiClient={fakeApiClient(dashboard())}
        context={resolved}
        direction="ltr"
        relationshipId={relationshipId}
        t={(key) => translate('en', key)}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('trainee-dashboard-summary')).toBeTruthy();
    });
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Balanced plan')).toBeTruthy();
  });

  it('removes Session A trainee content when generation changes before B context is available', async () => {
    const resolved = resolveTraineeWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(resolved.status).toBe('ready');
    if (resolved.status !== 'ready') return;

    const screen = await renderWithProviders(
      <NavigationSurface
        authState={authenticated(1)}
        direction="ltr"
        locale="en"
        renderAuth={() => null}
        renderRoute={() => (
          <TraineeHomeScreen
            apiClient={fakeApiClient(dashboard())}
            context={resolved}
            direction="ltr"
            t={(key) => translate('en', key)}
          />
        )}
        routes={[{ id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' }]}
        t={(key) => translate('en', key)}
        workspaceContext={resolved.workspaceContext}
      />,
    );
    expect(screen.getByText('Trainee home')).toBeTruthy();

    const replacementClient = createAppQueryClient();
    testQueryClients.add(replacementClient);
    await screen.rerender(
      <QueryClientProvider client={replacementClient}>
        <ThemeProvider>
          <NavigationSurface
            authState={authenticated(2)}
            direction="ltr"
            locale="en"
            renderAuth={() => null}
            routes={[{ id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' }]}
            t={(key) => translate('en', key)}
            workspaceContext={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Trainee home')).toBeNull();
    expect(screen.getByText('Workspace access context is not available.')).toBeTruthy();
  });

  it('renders Arabic RTL Trainee Home with accessible unavailable relationship state', async () => {
    const resolved = resolveTraineeWorkspaceContext({ generation: 1, rows: [workspaceRow()] });
    expect(resolved.status).toBe('ready');
    if (resolved.status !== 'ready') return;

    const screen = await renderWithProviders(
      <TraineeHomeScreen
        apiClient={fakeApiClient(dashboard())}
        context={resolved}
        direction="rtl"
        t={(key) => translate('ar', key)}
      />,
    );

    expect(screen.getByText('الرئيسية للمتدرب')).toBeTruthy();
    expect(screen.getByRole('summary')).toBeTruthy();
  });
});
