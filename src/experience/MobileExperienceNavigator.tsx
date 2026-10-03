import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createApiClient } from '@/api';
import { useAuthSession } from '@/auth';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { RoleAwareNavigator, type PersonaRoute } from '@/navigation';
import { protectedQueryScope } from '@/query';
import { StaffExperienceScreen } from '@/trainerAssistant';
import { TraineeHomeScreen } from '@/trainee';
import {
  fetchMyWorkspaceContexts,
  resolveUniqueMobileWorkspaceContext,
  type WorkspaceContextResolution,
} from '@/workspaceContext';

const implementedRoutes: PersonaRoute[] = [
  { id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' },
  { id: 'trainer.home', persona: 'TRAINER', labelKey: 'navigationHome' },
  { id: 'trainer.relationships', persona: 'TRAINER', labelKey: 'navigationRelationships' },
  { id: 'assistant.home', persona: 'ASSISTANT_TRAINER', labelKey: 'navigationHome' },
  {
    id: 'assistant.relationships',
    persona: 'ASSISTANT_TRAINER',
    labelKey: 'navigationRelationships',
  },
];

interface MobileExperienceNavigatorProps {
  direction: TextDirection;
  locale: 'en' | 'ar';
  t: (key: TranslationKey) => string;
}

export function MobileExperienceNavigator({
  direction,
  locale,
  t,
}: MobileExperienceNavigatorProps) {
  const { state } = useAuthSession();

  if (state.status !== 'authenticated' || !state.session) {
    return (
      <RoleAwareNavigator
        direction={direction}
        locale={locale}
        renderRoute={() => null}
        routes={implementedRoutes}
        t={t}
        workspaceContext={null}
      />
    );
  }

  return (
    <AuthenticatedMobileExperienceNavigator
      direction={direction}
      generation={state.session.generation}
      locale={locale}
      t={t}
    />
  );
}

interface AuthenticatedMobileExperienceNavigatorProps extends MobileExperienceNavigatorProps {
  generation: number;
}

function AuthenticatedMobileExperienceNavigator({
  direction,
  generation,
  locale,
  t,
}: AuthenticatedMobileExperienceNavigatorProps) {
  const { controller, state } = useAuthSession();
  const apiClient = useMemo(() => createApiClient({ auth: controller.authSeam }), [controller]);
  const workspaceQuery = useQuery({
    enabled: state.status === 'authenticated' && state.session?.generation === generation,
    queryKey: [protectedQueryScope, generation, 'mobile-experience', 'workspace-context'],
    queryFn: ({ signal }) => fetchMyWorkspaceContexts({ apiClient, signal }),
  });
  const workspaceContext: WorkspaceContextResolution | null = useMemo(() => {
    if (!workspaceQuery.data) return null;
    return resolveUniqueMobileWorkspaceContext({
      generation,
      personas: ['TRAINEE', 'TRAINER', 'ASSISTANT_TRAINER'],
      rows: workspaceQuery.data,
    });
  }, [generation, workspaceQuery.data]);
  const readyContext = workspaceContext?.status === 'ready' ? workspaceContext : null;

  return (
    <RoleAwareNavigator
      direction={direction}
      locale={locale}
      renderRoute={({ route }) => {
        if (!readyContext) return null;
        if (route.id === 'trainee.home') {
          return (
            <TraineeHomeScreen
              apiClient={apiClient}
              context={readyContext}
              direction={direction}
              t={t}
            />
          );
        }
        if (route.persona === 'TRAINER' || route.persona === 'ASSISTANT_TRAINER') {
          return (
            <StaffExperienceScreen
              apiClient={apiClient}
              context={readyContext}
              direction={direction}
              routeKind={route.id.endsWith('.relationships') ? 'relationships' : 'home'}
              t={t}
            />
          );
        }
        return null;
      }}
      routes={implementedRoutes}
      t={t}
      workspaceContext={readyContext?.workspaceContext ?? null}
    />
  );
}
