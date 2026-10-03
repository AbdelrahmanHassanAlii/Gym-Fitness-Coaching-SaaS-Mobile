import {
  hasExplicitTimezoneOffset,
  isWorkspaceMembershipRole,
  type MyWorkspaceContextDto,
} from '@/contracts';
import type { MobilePersona, NavigationWorkspaceContext } from '@/navigation';

export type WorkspaceContextResolution =
  | {
      status: 'ready';
      workspaceContext: NavigationWorkspaceContext;
      workspace: MyWorkspaceContextDto['workspace'];
      membership: MyWorkspaceContextDto['membership'];
    }
  | {
      status: 'unresolved';
      reason:
        | 'no-matching-workspace'
        | 'multiple-matching-workspaces'
        | 'malformed-workspace-data';
    };

export function parseMyWorkspaceContexts(value: unknown): MyWorkspaceContextDto[] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;

  const rows: MyWorkspaceContextDto[] = [];
  for (const item of data) {
    const row = parseMyWorkspaceContext(item);
    if (!row) return null;
    rows.push(row);
  }
  return rows;
}

export function resolveSinglePersonaWorkspaceContext(input: {
  generation: number;
  persona: MobilePersona;
  rows: readonly MyWorkspaceContextDto[];
}): WorkspaceContextResolution {
  const candidates = input.rows.filter(
    (row) =>
      row.workspace.status === 'ACTIVE' &&
      row.membership.status === 'ACTIVE' &&
      row.membership.workspaceId === row.workspace.id &&
      row.membership.roles.includes(input.persona),
  );

  if (candidates.length === 0) {
    return { status: 'unresolved', reason: 'no-matching-workspace' };
  }
  if (candidates.length > 1) {
    return { status: 'unresolved', reason: 'multiple-matching-workspaces' };
  }

  const selected = candidates[0];
  return {
    status: 'ready',
    workspace: selected.workspace,
    membership: selected.membership,
    workspaceContext: {
      generation: input.generation,
      workspaceId: selected.workspace.id,
      membershipId: selected.membership.id,
      roles: selected.membership.roles,
      preferredPersona: input.persona,
    },
  };
}

export function resolveUniqueMobileWorkspaceContext(input: {
  generation: number;
  personas: readonly MobilePersona[];
  rows: readonly MyWorkspaceContextDto[];
}): WorkspaceContextResolution {
  const candidates = input.rows.flatMap((row) => {
    if (
      row.workspace.status !== 'ACTIVE' ||
      row.membership.status !== 'ACTIVE' ||
      row.membership.workspaceId !== row.workspace.id
    ) {
      return [];
    }

    return input.personas
      .filter((persona) => row.membership.roles.includes(persona))
      .map((persona) => ({ persona, row }));
  });

  if (candidates.length === 0) {
    return { status: 'unresolved', reason: 'no-matching-workspace' };
  }
  if (candidates.length > 1) {
    return { status: 'unresolved', reason: 'multiple-matching-workspaces' };
  }

  const selected = candidates[0];
  return {
    status: 'ready',
    workspace: selected.row.workspace,
    membership: selected.row.membership,
    workspaceContext: {
      generation: input.generation,
      workspaceId: selected.row.workspace.id,
      membershipId: selected.row.membership.id,
      roles: selected.row.membership.roles,
      preferredPersona: selected.persona,
    },
  };
}

function parseMyWorkspaceContext(value: unknown): MyWorkspaceContextDto | null {
  if (!value || typeof value !== 'object') return null;
  const workspace = (value as { workspace?: unknown }).workspace;
  const membership = (value as { membership?: unknown }).membership;
  if (!workspace || typeof workspace !== 'object') return null;
  if (!membership || typeof membership !== 'object') return null;

  const workspaceDto = workspace as {
    id?: unknown;
    type?: unknown;
    name?: unknown;
    ownerUserId?: unknown;
    status?: unknown;
    timezone?: unknown;
    defaultLanguage?: unknown;
  };
  const membershipDto = membership as {
    id?: unknown;
    workspaceId?: unknown;
    userId?: unknown;
    roles?: unknown;
    status?: unknown;
    permissionProfileIds?: unknown;
    accessVersion?: unknown;
    joinedAt?: unknown;
    engagementPeriods?: unknown;
  };

  if (!nonEmptyString(workspaceDto.id)) return null;
  if (workspaceDto.type !== 'GYM' && workspaceDto.type !== 'INDEPENDENT_TRAINER') return null;
  if (!nonEmptyString(workspaceDto.name)) return null;
  if (!nonEmptyString(workspaceDto.ownerUserId)) return null;
  if (workspaceDto.status !== 'ACTIVE') return null;
  if (!nonEmptyString(workspaceDto.timezone)) return null;
  if (workspaceDto.defaultLanguage !== 'ar' && workspaceDto.defaultLanguage !== 'en') return null;

  if (!nonEmptyString(membershipDto.id)) return null;
  if (membershipDto.workspaceId !== workspaceDto.id) return null;
  if (!nonEmptyString(membershipDto.userId)) return null;
  if (!Array.isArray(membershipDto.roles)) return null;
  if (membershipDto.roles.some((role) => !isWorkspaceMembershipRole(role))) return null;
  if (membershipDto.status !== 'ACTIVE') return null;
  if (!Array.isArray(membershipDto.permissionProfileIds)) return null;
  if (typeof membershipDto.accessVersion !== 'number') return null;
  if (!hasExplicitTimezoneOffset(membershipDto.joinedAt)) return null;
  if (!Array.isArray(membershipDto.engagementPeriods)) return null;
  if (
    membershipDto.engagementPeriods.some((period) => {
      if (!period || typeof period !== 'object') return true;
      const candidate = period as { startedAt?: unknown; endedAt?: unknown };
      return (
        !hasExplicitTimezoneOffset(candidate.startedAt) ||
        (candidate.endedAt !== undefined &&
          candidate.endedAt !== null &&
          !hasExplicitTimezoneOffset(candidate.endedAt))
      );
    })
  ) {
    return null;
  }

  return value as MyWorkspaceContextDto;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}
