import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
} from 'react';

import { useAuthSession } from '@/auth';
import type {
  BranchId,
  RelationshipId,
  WorkspaceId,
} from '@/contracts/common/wire';
import type { VerifiedMobilePermissionKey } from '@/contracts';
import {
  resolveAccessDecision,
  unresolvedAccessDecision,
  type AccessDecision,
  type PermissionAccessFacts,
} from './model';

interface AccessContextValue {
  currentGeneration: number | null;
  facts: PermissionAccessFacts | null;
}

const AccessContext = createContext<AccessContextValue | null>(null);

export interface AccessProviderProps extends PropsWithChildren {
  facts?: PermissionAccessFacts | null;
}

export function AccessProvider({ children, facts = null }: AccessProviderProps) {
  const { state } = useAuthSession();
  const currentGeneration =
    state.status === 'authenticated' ? state.session?.generation ?? null : null;
  const value = useMemo<AccessContextValue>(
    () => ({ currentGeneration, facts }),
    [currentGeneration, facts],
  );

  return <AccessContext.Provider value={value}>{children}</AccessContext.Provider>;
}

export interface UseAccessDecisionInput {
  permission: VerifiedMobilePermissionKey | string;
  workspaceId?: WorkspaceId;
  branchId?: BranchId;
  relationshipId?: RelationshipId;
}

export function useAccessDecision(input: UseAccessDecisionInput): AccessDecision {
  const value = useContext(AccessContext);
  if (!value) return unresolvedAccessDecision;

  return resolveAccessDecision({
    ...input,
    currentGeneration: value.currentGeneration,
    facts: value.facts,
  });
}

export function usePermission(permission: VerifiedMobilePermissionKey | string): AccessDecision {
  return useAccessDecision({ permission });
}
