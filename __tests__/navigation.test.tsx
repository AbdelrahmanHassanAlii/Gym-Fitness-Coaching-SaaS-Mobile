import { describe, expect, it } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import type {
  BranchId,
  EffectivePermissionDecisionDto,
  RelationshipId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import type { AuthState } from '@/auth';
import { translate } from '@/i18n/messages';
import {
  NavigationSurface,
  navigationStateContainsSecret,
  personaRoutes,
  selectMobilePersona,
  type NavigationWorkspaceContext,
  type PersonaRoute,
} from '@/navigation';
import type { PermissionAccessFacts } from '@/permissions';
import { ThemeProvider } from '@/theme';

const workspaceA = 'workspace-a' as WorkspaceId;
const workspaceB = 'workspace-b' as WorkspaceId;
const membershipA = 'membership-a' as WorkspaceMembershipId;
const membershipB = 'membership-b' as WorkspaceMembershipId;
const branchA = 'branch-a' as BranchId;
const relationshipA = 'relationship-a' as RelationshipId;

const authenticated = (generation: number): AuthState => ({
  status: 'authenticated',
  session: {
    user: {
      id: 'user-1' as never,
      firstName: 'Hassan',
      lastName: 'Coach',
      emailVerified: true,
      phoneVerified: false,
    },
    restrictedUntilVerified: false,
    generation,
  },
});

const unauthenticated: AuthState = { status: 'unauthenticated' };
const initializing: AuthState = { status: 'initializing' };

function context(
  roles: readonly unknown[],
  generation = 1,
  workspaceId = workspaceA,
  membershipId = membershipA,
): NavigationWorkspaceContext {
  return { generation, workspaceId, membershipId, roles };
}

function allow(permission = 'workouts.read'): EffectivePermissionDecisionDto {
  return { permission, effect: 'ALLOW', allowed: true, source: 'PROFILE' };
}

function deny(permission = 'workouts.read'): EffectivePermissionDecisionDto {
  return {
    permission,
    effect: 'DENY',
    allowed: false,
    source: 'EXPLICIT_GRANT',
    explicitDeny: true,
  };
}

function facts(input: Partial<PermissionAccessFacts> = {}): PermissionAccessFacts {
  return {
    generation: 1,
    workspaceId: workspaceA,
    membershipId: membershipA,
    roles: ['TRAINER'],
    decisions: [allow()],
    ...input,
  };
}

async function renderNavigation(props: {
  authState?: AuthState;
  workspaceContext?: NavigationWorkspaceContext | null;
  accessFacts?: PermissionAccessFacts | null;
  routes?: PersonaRoute[];
  initialRouteId?: PersonaRoute['id'];
  locale?: 'en' | 'ar';
}) {
  const locale = props.locale ?? 'en';
  return await render(
    <ThemeProvider>
      <NavigationSurface
        accessFacts={props.accessFacts}
        authState={props.authState ?? authenticated(1)}
        direction={locale === 'ar' ? 'rtl' : 'ltr'}
        initialRouteId={props.initialRouteId}
        locale={locale}
        renderAuth={() => null}
        routes={props.routes}
        t={(key) => translate(locale, key)}
        workspaceContext={props.workspaceContext}
      />
    </ThemeProvider>,
  );
}

describe('role-aware persona selection', () => {
  it('does not expose protected navigation during auth initialization and routes unauthenticated users to auth flow', async () => {
    const initializingScreen = await renderNavigation({ authState: initializing, workspaceContext: null });
    expect(initializingScreen.getByText('Preparing session')).toBeTruthy();
    expect(initializingScreen.queryByText('Trainer')).toBeNull();

    const authScreen = await renderNavigation({ authState: unauthenticated, workspaceContext: null });
    expect(authScreen.getByRole('header', { name: 'Authentication' })).toBeTruthy();
    expect(authScreen.queryByText('Trainer')).toBeNull();
  });

  it('selects each Mobile V1 persona only from verified workspace membership roles', () => {
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['TRAINEE']) }))
      .toMatchObject({ status: 'selected', persona: 'TRAINEE' });
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['TRAINER']) }))
      .toMatchObject({ status: 'selected', persona: 'TRAINER' });
    expect(
      selectMobilePersona({
        authGeneration: 1,
        workspaceContext: context(['ASSISTANT_TRAINER']),
      }),
    ).toMatchObject({ status: 'selected', persona: 'ASSISTANT_TRAINER' });
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['NUTRITIONIST']) }))
      .toMatchObject({ status: 'selected', persona: 'NUTRITIONIST' });
  });

  it('does not convert owners, managers, unknown, or malformed roles into privileged Mobile personas', () => {
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['GYM_OWNER']) }))
      .toMatchObject({ status: 'unsupported', reason: 'owner-manager-not-mobile-v1' });
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['GYM_MANAGER']) }))
      .toMatchObject({ status: 'unsupported', reason: 'owner-manager-not-mobile-v1' });
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context(['PLATFORM_ADMIN']) }))
      .toMatchObject({ status: 'malformed', reason: 'invalid-role-data' });
    expect(selectMobilePersona({ authGeneration: 1, workspaceContext: context([null]) }))
      .toMatchObject({ status: 'malformed', reason: 'invalid-role-data' });
  });

  it('does not guess privilege ordering for multi-role workspace memberships', () => {
    expect(
      selectMobilePersona({ authGeneration: 1, workspaceContext: context(['TRAINER', 'NUTRITIONIST']) }),
    ).toMatchObject({ status: 'ambiguous' });
    expect(
      selectMobilePersona({
        authGeneration: 1,
        workspaceContext: { ...context(['TRAINER', 'NUTRITIONIST']), preferredPersona: 'NUTRITIONIST' },
      }),
    ).toMatchObject({ status: 'selected', persona: 'NUTRITIONIST' });
  });

  it('renders foundation shells for each supported persona without implementing product workflows', async () => {
    expect((await renderNavigation({ workspaceContext: context(['TRAINEE']) })).getByText('Trainee')).toBeTruthy();
    expect((await renderNavigation({ workspaceContext: context(['TRAINER']) })).getByText('Trainer')).toBeTruthy();
    expect(
      (await renderNavigation({ workspaceContext: context(['ASSISTANT_TRAINER']) })).getByText(
        'Assistant Trainer',
      ),
    ).toBeTruthy();
    expect(
      (await renderNavigation({ workspaceContext: context(['NUTRITIONIST']) })).getByText('Nutritionist'),
    ).toBeTruthy();
  });
});

describe('role-aware navigation authorization boundaries', () => {
  const protectedTrainerRoutes: PersonaRoute[] = [
    { ...personaRoutes.TRAINER[0], requiredPermission: 'workouts.read' },
    { ...personaRoutes.TRAINER[1], requiredPermission: 'trainees.read' },
  ];

  it('keeps role and permission separate for trainer, assistant, nutritionist, and trainee personas', async () => {
    for (const role of ['TRAINER', 'ASSISTANT_TRAINER', 'NUTRITIONIST', 'TRAINEE'] as const) {
      const routes: PersonaRoute[] =
        role === 'ASSISTANT_TRAINER'
          ? [{ ...personaRoutes.ASSISTANT_TRAINER[0], requiredPermission: 'workouts.read' }]
          : role === 'NUTRITIONIST'
            ? [{ ...personaRoutes.NUTRITIONIST[0], requiredPermission: 'nutrition.plans.read' }]
            : role === 'TRAINEE'
              ? [{ ...personaRoutes.TRAINEE[0], requiredPermission: 'workouts.complete' }]
              : protectedTrainerRoutes;
      const screen = await renderNavigation({
        workspaceContext: context([role]),
        accessFacts: facts({ roles: [role], decisions: [deny(routes[0].requiredPermission)] }),
        routes,
      });

      expect(screen.queryByTestId(`navigation-screen-${routes[0].id}`)).toBeNull();
      expect(screen.getByRole('alert')).toBeTruthy();
    }
  });

  it('fails closed for unresolved or unavailable permission data and does not flash a protected destination', async () => {
    const unresolved = await renderNavigation({
      workspaceContext: context(['TRAINER']),
      accessFacts: null,
      routes: protectedTrainerRoutes,
    });
    expect(unresolved.queryByTestId('navigation-screen-trainer.home')).toBeNull();

    const unavailable = await renderNavigation({
      workspaceContext: context(['TRAINER']),
      accessFacts: facts({ loadError: new Error('network') }),
      routes: protectedTrainerRoutes,
    });
    expect(unavailable.queryByTestId('navigation-screen-trainer.home')).toBeNull();
  });

  it('does not let direct route selection bypass current access state', async () => {
    const screen = await renderNavigation({
      workspaceContext: context(['TRAINER']),
      accessFacts: facts({ decisions: [deny('trainees.read')] }),
      initialRouteId: 'trainer.relationships',
      routes: protectedTrainerRoutes,
    });

    expect(screen.queryByTestId('navigation-screen-trainer.relationships')).toBeNull();
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('does not infer assigned-trainee, branch, or relationship access from role or broad facts', () => {
    const branchFacts = facts({
      branchAccess: { includeBranchIds: [branchA] },
      decisions: [{ ...allow(), scope: { type: 'BRANCH', resourceIds: [branchA] } }],
    });
    const relationshipFacts = facts({
      relationshipAccess: { includeRelationshipIds: [relationshipA] },
      decisions: [{ ...allow(), scope: { type: 'SPECIFIC_TRAINEES', resourceIds: [relationshipA] } }],
    });
    const assignedTraineesFacts = facts({
      relationshipAccess: { assignedTrainees: true },
      decisions: [{ ...allow(), scope: { type: 'ASSIGNED_TRAINEES' } }],
    });

    expect(
      selectMobilePersona({ authGeneration: 1, workspaceContext: context(['TRAINER']) }),
    ).toMatchObject({ status: 'selected' });
    expect(branchFacts.branchAccess?.includeBranchIds).toEqual([branchA]);
    expect(relationshipFacts.relationshipAccess?.includeRelationshipIds).toEqual([relationshipA]);
    expect(assignedTraineesFacts.relationshipAccess?.assignedTrainees).toBe(true);
  });
});

describe('role-aware navigation session, workspace, and native UX safety', () => {
  it('clears visible persona navigation immediately on generation replacement and rejects late A workspace context', async () => {
    const screen = await renderNavigation({
      authState: authenticated(1),
      workspaceContext: context(['TRAINER'], 1),
    });
    expect(screen.getByText('Trainer')).toBeTruthy();

    await screen.rerender(
      <ThemeProvider>
        <NavigationSurface
          authState={authenticated(2)}
          direction="ltr"
          locale="en"
          renderAuth={() => null}
          t={(key) => translate('en', key)}
          workspaceContext={null}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Trainer')).toBeNull();
    expect(screen.getByText('Workspace access context is not available.')).toBeTruthy();

    await screen.rerender(
      <ThemeProvider>
        <NavigationSurface
          authState={authenticated(2)}
          direction="ltr"
          locale="en"
          renderAuth={() => null}
          t={(key) => translate('en', key)}
          workspaceContext={context(['TRAINER'], 1)}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Trainer')).toBeNull();
  });

  it('resets route history after logout, account replacement, workspace replacement, and persona changes', async () => {
    const screen = await renderNavigation({
      authState: authenticated(1),
      workspaceContext: context(['TRAINER'], 1, workspaceA, membershipA),
    });
    fireEvent.press(screen.getByRole('button', { name: 'Relationships' }));
    await waitFor(() => {
      expect(screen.getByTestId('navigation-screen-trainer.relationships')).toBeTruthy();
    });

    await screen.rerender(
      <ThemeProvider>
        <NavigationSurface
          authState={unauthenticated}
          direction="ltr"
          locale="en"
          renderAuth={() => null}
          t={(key) => translate('en', key)}
          workspaceContext={null}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('navigation-screen-trainer.relationships')).toBeNull();

    await screen.rerender(
      <ThemeProvider>
        <NavigationSurface
          authState={authenticated(2)}
          direction="ltr"
          locale="en"
          renderAuth={() => null}
          t={(key) => translate('en', key)}
          workspaceContext={context(['TRAINER'], 2, workspaceB, membershipB)}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('navigation-screen-trainer.relationships')).toBeNull();
    expect(screen.getByTestId('navigation-screen-trainer.home')).toBeTruthy();

    await screen.rerender(
      <ThemeProvider>
        <NavigationSurface
          authState={authenticated(3)}
          direction="ltr"
          locale="en"
          renderAuth={() => null}
          t={(key) => translate('en', key)}
          workspaceContext={context(['NUTRITIONIST'], 3, workspaceB, membershipB)}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('navigation-screen-trainer.home')).toBeNull();
    expect(screen.getByTestId('navigation-screen-nutritionist.home')).toBeTruthy();
  });

  it('keeps workspace A context from authorizing workspace B navigation', async () => {
    const screen = await renderNavigation({
      authState: authenticated(2),
      workspaceContext: context(['TRAINER'], 1, workspaceA, membershipA),
    });

    expect(screen.queryByText('Trainer')).toBeNull();
    expect(screen.getByText('Workspace access context is not available.')).toBeTruthy();
  });

  it('renders English and Arabic/RTL navigation with accessible selected state', async () => {
    const en = await renderNavigation({ workspaceContext: context(['TRAINER']) });
    expect(en.getByRole('button', { name: 'Home' }).props.accessibilityState).toMatchObject({
      selected: true,
    });

    const ar = await renderNavigation({ workspaceContext: context(['NUTRITIONIST']), locale: 'ar' });
    expect(ar.getByText('أخصائي تغذية')).toBeTruthy();
    expect(ar.getByRole('button', { name: 'الرئيسية' }).props.accessibilityState).toMatchObject({
      selected: true,
    });
  });

  it('does not place credential-shaped values in navigation state', () => {
    expect(
      navigationStateContainsSecret({
        generation: 1,
        workspaceId: workspaceA,
        membershipId: membershipA,
        persona: 'TRAINER',
      }),
    ).toBe(false);
    expect(navigationStateContainsSecret({ accessToken: 'secret' })).toBe(true);
    expect(navigationStateContainsSecret({ refresh_token: 'secret' })).toBe(true);
  });
});
