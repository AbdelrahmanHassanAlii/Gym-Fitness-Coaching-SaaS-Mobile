import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ApiClientError } from '@/api';
import {
  isVerifiedMobilePermissionKey,
  type BranchId,
  type EffectivePermissionDecisionDto,
  type RelationshipId,
  type WorkspaceId,
  type WorkspaceMembershipId,
} from '@/contracts';
import {
  AccessBoundary,
  AccessControlledPressable,
  accessDecisionFromApiError,
  resolveAccessDecision,
  roleContextHasRole,
  type PermissionAccessFacts,
} from '@/permissions';
import { shouldRetryQuery } from '@/query';
import { ThemeProvider } from '@/theme';

const workspaceA = 'workspace-a' as WorkspaceId;
const workspaceB = 'workspace-b' as WorkspaceId;
const membershipA = 'membership-a' as WorkspaceMembershipId;
const branchA = 'branch-a' as BranchId;
const branchB = 'branch-b' as BranchId;
const relationshipA = 'relationship-a' as RelationshipId;
const relationshipB = 'relationship-b' as RelationshipId;

function allow(permission = 'workouts.read'): EffectivePermissionDecisionDto {
  return {
    permission,
    effect: 'ALLOW',
    allowed: true,
    source: 'PROFILE',
  };
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

function scopedAllow(
  permission = 'workouts.read',
  scope: EffectivePermissionDecisionDto['scope'],
): EffectivePermissionDecisionDto {
  return {
    ...allow(permission),
    scope,
  };
}

function scopedDeny(
  permission = 'workouts.read',
  scope: EffectivePermissionDecisionDto['scope'],
): EffectivePermissionDecisionDto {
  return {
    ...deny(permission),
    scope,
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

describe('permission access model', () => {
  it('treats unresolved, unknown, malformed, and load-error access as not allowed', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: null,
      }),
    ).toMatchObject({ state: 'unresolved' });
    expect(
      resolveAccessDecision({
        permission: 'invented.permission',
        currentGeneration: 1,
        facts: facts(),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'unknown-permission' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: facts({
          decisions: [{ permission: 'workouts.read', effect: 'ALLOW', allowed: 'yes' } as never],
        }),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'malformed-access-fact' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: facts({ loadError: new Error('network') }),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'access-data-failed' });
  });

  it('allows verified permission facts and gives effective DENY precedence', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: facts(),
      }),
    ).toMatchObject({ state: 'allowed' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: facts({ decisions: [allow(), deny()] }),
      }),
    ).toMatchObject({ state: 'denied', reason: 'explicit-deny' });
  });

  it('does not use role context as permission or a role-to-permission map', () => {
    const roleOnlyFacts = facts({ decisions: [], roles: ['TRAINER'] });
    const trainerFacts = facts({ roles: ['TRAINER'] });
    const nutritionistFacts = facts({ roles: ['NUTRITIONIST'] });

    expect(roleContextHasRole(roleOnlyFacts.roles, 'TRAINER')).toBe(true);
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: roleOnlyFacts,
      }),
    ).toMatchObject({ state: 'denied', reason: 'no-verified-allow' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: trainerFacts,
      }),
    ).toEqual(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: nutritionistFacts,
      }),
    );
  });

  it('does not infer branch or relationship access from workspace permission or role', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        branchId: branchA,
        facts: facts(),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'branch-context-unverified' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        relationshipId: relationshipA,
        facts: facts({ roles: ['TRAINER'] }),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'relationship-context-unverified' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        relationshipId: relationshipA,
        facts: facts({ relationshipAccess: { assignedTrainees: true } }),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'relationship-context-unverified' });
  });

  it('keeps workspace, branch, and relationship context isolated', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        workspaceId: workspaceB,
        facts: facts({ workspaceId: workspaceA }),
      }),
    ).toMatchObject({ state: 'unresolved', reason: 'missing-context' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        branchId: branchB,
        facts: facts({ branchAccess: { includeBranchIds: [branchA] } }),
      }),
    ).toMatchObject({ state: 'denied' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        relationshipId: relationshipB,
        facts: facts({ relationshipAccess: { includeRelationshipIds: [relationshipA] } }),
      }),
    ).toMatchObject({ state: 'denied' });
  });

  it('keeps scoped deny decisions contextual instead of leaking across branches or relationships', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        branchId: branchA,
        facts: facts({
          branchAccess: { includeBranchIds: [branchA, branchB] },
          decisions: [
            allow(),
            scopedDeny('workouts.read', { type: 'BRANCH', resourceIds: [branchA] }),
          ],
        }),
      }),
    ).toMatchObject({ state: 'denied', reason: 'explicit-deny' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        branchId: branchB,
        facts: facts({
          branchAccess: { includeBranchIds: [branchA, branchB] },
          decisions: [
            allow(),
            scopedDeny('workouts.read', { type: 'BRANCH', resourceIds: [branchA] }),
          ],
        }),
      }),
    ).toMatchObject({ state: 'allowed' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        relationshipId: relationshipB,
        facts: facts({
          relationshipAccess: { includeRelationshipIds: [relationshipA, relationshipB] },
          decisions: [
            allow(),
            scopedDeny('workouts.read', {
              type: 'SPECIFIC_TRAINEES',
              resourceIds: [relationshipA],
            }),
          ],
        }),
      }),
    ).toMatchObject({ state: 'allowed' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.update',
        currentGeneration: 1,
        facts: facts({ decisions: [allow('workouts.update'), deny('workouts.read')] }),
      }),
    ).toMatchObject({ state: 'allowed' });
  });

  it('fails closed on contradictory or malformed effective access facts', () => {
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        facts: facts({
          decisions: [{ ...allow(), allowed: false }],
        }),
      }),
    ).toMatchObject({ state: 'unavailable', reason: 'malformed-access-fact' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 1,
        branchId: branchA,
        facts: facts({
          branchAccess: { includeBranchIds: [branchA] },
          decisions: [
            scopedAllow('workouts.read', { type: 'BRANCH', resourceIds: [branchA] }),
            scopedDeny('workouts.read', { type: 'BRANCH', resourceIds: [branchA] }),
          ],
        }),
      }),
    ).toMatchObject({ state: 'denied', reason: 'explicit-deny' });
  });

  it('prevents session/account/workspace race leakage through generation binding', () => {
    const lateAllowA = facts({ generation: 1, decisions: [allow()] });
    const currentDenyB = facts({ generation: 2, decisions: [deny()] });

    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 2,
        facts: lateAllowA,
      }),
    ).toMatchObject({ state: 'unresolved', reason: 'stale-generation' });
    expect(
      resolveAccessDecision({
        permission: 'workouts.read',
        currentGeneration: 2,
        facts: currentDenyB,
      }),
    ).toMatchObject({ state: 'denied' });
  });

  it('normalizes Backend 403 as denied without implying logout or mutation retry', () => {
    const forbidden = new ApiClientError({
      kind: 'permission',
      source: 'backend',
      message: 'Forbidden',
      status: 403,
      code: 'PERMISSION_DENIED',
    });
    const relationshipForbidden = new ApiClientError({
      kind: 'relationship_access',
      source: 'backend',
      message: 'Forbidden',
      status: 403,
      code: 'RELATIONSHIP_ACCESS_DENIED',
    });

    expect(accessDecisionFromApiError(forbidden)).toMatchObject({
      state: 'denied',
      reason: 'backend-denied',
    });
    expect(accessDecisionFromApiError(relationshipForbidden)).toMatchObject({
      state: 'denied',
      reason: 'relationship-denied',
    });
    expect(shouldRetryQuery(0, forbidden)).toBe(false);

    const unauthenticated = new ApiClientError({
      kind: 'authentication',
      source: 'backend',
      message: 'Unauthenticated',
      status: 401,
      code: 'AUTH_REQUIRED',
    });
    expect(accessDecisionFromApiError(unauthenticated)).toBeNull();
  });

  it('keeps Platform Admin and restricted account facts from inventing Mobile policy', () => {
    const platformRoleFacts = facts({
      roles: ['GYM_OWNER'],
      restrictedUntilVerified: true,
      decisions: [],
    });

    expect(
      resolveAccessDecision({
        permission: 'dashboard.trainer.read',
        currentGeneration: 1,
        facts: platformRoleFacts,
      }),
    ).toMatchObject({ state: 'denied', reason: 'no-verified-allow' });
  });

  it('uses only verified Backend permission identifiers', () => {
    expect(isVerifiedMobilePermissionKey('workouts.read')).toBe(true);
    expect(isVerifiedMobilePermissionKey('trainerCanSee')).toBe(false);
  });
});

describe('permission UX components', () => {
  it('renders accessible denied fallback and disabled controls in English and Arabic/RTL', async () => {
    const denied = { state: 'denied', reason: 'backend-denied' } as const;
    const onPress = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <AccessBoundary decision={denied} locale="ar" direction="rtl">
          <Text>Hidden action</Text>
        </AccessBoundary>
        <AccessControlledPressable
          decision={denied}
          label="Delete"
          locale="en"
          onPress={onPress}
        />
      </ThemeProvider>,
    );

    expect(screen.getByRole('alert', { name: 'ليس لديك صلاحية لهذا الإجراء.' })).toBeTruthy();
    const button = screen.getByRole('button', {
      name: 'Delete. You do not have access to this action.',
    });
    expect(button).toBeDisabled();
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders allowed controls and hide mode without blank denied screens', async () => {
    const allowed = { state: 'allowed', reason: 'allowed' } as const;
    const denied = { state: 'denied', reason: 'explicit-deny' } as const;
    const onPress = jest.fn();
    const screen = await render(
      <ThemeProvider>
        <AccessBoundary decision={denied} mode="hide">
          <Text>Hidden action</Text>
        </AccessBoundary>
        <AccessControlledPressable decision={allowed} label="Open" onPress={onPress} />
      </ThemeProvider>,
    );

    expect(screen.queryByText('Hidden action')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Open' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('removes protected children immediately when access becomes unresolved', async () => {
    const allowed = { state: 'allowed', reason: 'allowed' } as const;
    const unresolved = { state: 'unresolved', reason: 'stale-generation' } as const;
    const screen = await render(
      <ThemeProvider>
        <AccessBoundary decision={allowed} mode="fallback">
          <Text>Protected action</Text>
        </AccessBoundary>
      </ThemeProvider>,
    );

    expect(screen.getByText('Protected action')).toBeTruthy();

    await screen.rerender(
      <ThemeProvider>
        <AccessBoundary decision={unresolved} mode="fallback">
          <Text>Protected action</Text>
        </AccessBoundary>
      </ThemeProvider>,
    );

    expect(screen.queryByText('Protected action')).toBeNull();
    expect(screen.getByRole('alert', { name: 'Checking access.' })).toBeTruthy();
  });
});
