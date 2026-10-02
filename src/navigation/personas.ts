import {
  isWorkspaceMembershipRole,
  type VerifiedMobilePermissionKey,
  type WorkspaceId,
  type WorkspaceMembershipId,
  type WorkspaceMembershipRole,
} from '@/contracts';

export const mobilePersonas = ['TRAINEE', 'TRAINER', 'ASSISTANT_TRAINER', 'NUTRITIONIST'] as const;
export type MobilePersona = (typeof mobilePersonas)[number];

export type RoleAwareRouteId =
  | 'trainee.home'
  | 'trainee.training'
  | 'trainee.nutrition'
  | 'trainee.progress'
  | 'trainer.home'
  | 'trainer.relationships'
  | 'trainer.training'
  | 'trainer.progress'
  | 'assistant.home'
  | 'assistant.relationships'
  | 'assistant.training'
  | 'assistant.progress'
  | 'nutritionist.home'
  | 'nutritionist.relationships'
  | 'nutritionist.nutrition'
  | 'nutritionist.progress';

export type PersonaSelection =
  | {
      status: 'unresolved';
      reason: 'missing-auth-generation' | 'missing-workspace-context' | 'stale-workspace-context';
    }
  | {
      status: 'selected';
      persona: MobilePersona;
      role: MobilePersona;
      workspaceId: WorkspaceId;
      membershipId: WorkspaceMembershipId;
    }
  | {
      status: 'ambiguous';
      reason: 'multiple-mobile-personas';
      supportedRoles: MobilePersona[];
    }
  | {
      status: 'unsupported';
      reason: 'owner-manager-not-mobile-v1' | 'no-mobile-persona';
      roles: WorkspaceMembershipRole[];
    }
  | {
      status: 'malformed';
      reason: 'invalid-role-data' | 'invalid-workspace-context' | 'preferred-persona-not-verified';
    };

export interface NavigationWorkspaceContext {
  generation: number;
  workspaceId: WorkspaceId;
  membershipId: WorkspaceMembershipId;
  roles: readonly unknown[];
  preferredPersona?: MobilePersona;
}

export interface PersonaRoute {
  id: RoleAwareRouteId;
  persona: MobilePersona;
  labelKey: NavigationMessageKey;
  requiredPermission?: VerifiedMobilePermissionKey;
}

export type NavigationMessageKey =
  | 'navigationAuthFlow'
  | 'navigationInitializing'
  | 'navigationContextUnavailable'
  | 'navigationUnsupportedPersona'
  | 'navigationAmbiguousPersona'
  | 'navigationTrainee'
  | 'navigationTrainer'
  | 'navigationAssistantTrainer'
  | 'navigationNutritionist'
  | 'navigationHome'
  | 'navigationTraining'
  | 'navigationNutrition'
  | 'navigationProgress'
  | 'navigationRelationships'
  | 'navigationRouteUnavailable';

const ownerManagerRoles = new Set<WorkspaceMembershipRole>(['GYM_OWNER', 'GYM_MANAGER']);

export const personaLabels: Record<MobilePersona, NavigationMessageKey> = {
  TRAINEE: 'navigationTrainee',
  TRAINER: 'navigationTrainer',
  ASSISTANT_TRAINER: 'navigationAssistantTrainer',
  NUTRITIONIST: 'navigationNutritionist',
};

export const personaRoutes: Record<MobilePersona, PersonaRoute[]> = {
  TRAINEE: [
    { id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' },
    { id: 'trainee.training', persona: 'TRAINEE', labelKey: 'navigationTraining' },
    { id: 'trainee.nutrition', persona: 'TRAINEE', labelKey: 'navigationNutrition' },
    { id: 'trainee.progress', persona: 'TRAINEE', labelKey: 'navigationProgress' },
  ],
  TRAINER: [
    { id: 'trainer.home', persona: 'TRAINER', labelKey: 'navigationHome' },
    { id: 'trainer.relationships', persona: 'TRAINER', labelKey: 'navigationRelationships' },
    { id: 'trainer.training', persona: 'TRAINER', labelKey: 'navigationTraining' },
    { id: 'trainer.progress', persona: 'TRAINER', labelKey: 'navigationProgress' },
  ],
  ASSISTANT_TRAINER: [
    { id: 'assistant.home', persona: 'ASSISTANT_TRAINER', labelKey: 'navigationHome' },
    {
      id: 'assistant.relationships',
      persona: 'ASSISTANT_TRAINER',
      labelKey: 'navigationRelationships',
    },
    { id: 'assistant.training', persona: 'ASSISTANT_TRAINER', labelKey: 'navigationTraining' },
    { id: 'assistant.progress', persona: 'ASSISTANT_TRAINER', labelKey: 'navigationProgress' },
  ],
  NUTRITIONIST: [
    { id: 'nutritionist.home', persona: 'NUTRITIONIST', labelKey: 'navigationHome' },
    {
      id: 'nutritionist.relationships',
      persona: 'NUTRITIONIST',
      labelKey: 'navigationRelationships',
    },
    { id: 'nutritionist.nutrition', persona: 'NUTRITIONIST', labelKey: 'navigationNutrition' },
    { id: 'nutritionist.progress', persona: 'NUTRITIONIST', labelKey: 'navigationProgress' },
  ],
};

export function selectMobilePersona(input: {
  authGeneration: number | null;
  workspaceContext?: NavigationWorkspaceContext | null;
}): PersonaSelection {
  const { authGeneration, workspaceContext } = input;
  if (authGeneration === null) {
    return { status: 'unresolved', reason: 'missing-auth-generation' };
  }
  if (!workspaceContext) {
    return { status: 'unresolved', reason: 'missing-workspace-context' };
  }
  if (workspaceContext.generation !== authGeneration) {
    return { status: 'unresolved', reason: 'stale-workspace-context' };
  }
  if (
    typeof workspaceContext.workspaceId !== 'string' ||
    workspaceContext.workspaceId.length === 0 ||
    typeof workspaceContext.membershipId !== 'string' ||
    workspaceContext.membershipId.length === 0
  ) {
    return { status: 'malformed', reason: 'invalid-workspace-context' };
  }
  if (
    !Array.isArray(workspaceContext.roles) ||
    workspaceContext.roles.some((role) => !isWorkspaceMembershipRole(role))
  ) {
    return { status: 'malformed', reason: 'invalid-role-data' };
  }

  const roles = Array.from(new Set(workspaceContext.roles)) as WorkspaceMembershipRole[];
  const supportedRoles = roles.filter(isMobilePersona);
  if (supportedRoles.length === 0) {
    return {
      status: 'unsupported',
      reason: roles.some((role) => ownerManagerRoles.has(role))
        ? 'owner-manager-not-mobile-v1'
        : 'no-mobile-persona',
      roles,
    };
  }

  if (workspaceContext.preferredPersona) {
    if (!supportedRoles.includes(workspaceContext.preferredPersona)) {
      return { status: 'malformed', reason: 'preferred-persona-not-verified' };
    }
    return {
      status: 'selected',
      persona: workspaceContext.preferredPersona,
      role: workspaceContext.preferredPersona,
      workspaceId: workspaceContext.workspaceId,
      membershipId: workspaceContext.membershipId,
    };
  }

  if (supportedRoles.length > 1) {
    return {
      status: 'ambiguous',
      reason: 'multiple-mobile-personas',
      supportedRoles,
    };
  }

  return {
    status: 'selected',
    persona: supportedRoles[0],
    role: supportedRoles[0],
    workspaceId: workspaceContext.workspaceId,
    membershipId: workspaceContext.membershipId,
  };
}

export function isMobilePersona(role: unknown): role is MobilePersona {
  return typeof role === 'string' && mobilePersonas.includes(role as MobilePersona);
}

export function routeBelongsToPersona(route: PersonaRoute, persona: MobilePersona): boolean {
  return route.persona === persona;
}

export function resolveInitialRouteId(
  routes: readonly PersonaRoute[],
  initialRouteId?: RoleAwareRouteId,
): RoleAwareRouteId | undefined {
  const route = routes.find((candidate) => candidate.id === initialRouteId) ?? routes[0];
  return route?.id;
}

export function createNavigationIdentity(input: {
  generation: number;
  persona: MobilePersona;
  workspaceId: WorkspaceId;
  membershipId: WorkspaceMembershipId;
}): string {
  return [input.generation, input.workspaceId, input.membershipId, input.persona].join(':');
}

export function navigationStateContainsSecret(value: unknown): boolean {
  const text = JSON.stringify(value) ?? '';
  return /access[-_]?token|refresh[-_]?token|authorization|bearer\s+/i.test(text);
}
