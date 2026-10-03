import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createApiClient } from '@/api';
import { useAuthSession } from '@/auth';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { RoleAwareNavigator, type PersonaRoute } from '@/navigation';
import { protectedQueryScope } from '@/query';
import { fetchMyWorkspaceContexts } from '@/workspaceContext';

import { resolveTrainerAssistantWorkspaceContext, type StaffWorkspaceResolution } from './guards';
import { StaffExperienceScreen } from './StaffExperienceScreen';

const staffRoutes: PersonaRoute[] = [
  { id: 'trainer.home', persona: 'TRAINER', labelKey: 'navigationHome' },
  { id: 'trainer.relationships', persona: 'TRAINER', labelKey: 'navigationRelationships' },
  { id: 'assistant.home', persona: 'ASSISTANT_TRAINER', labelKey: 'navigationHome' },
  {
    id: 'assistant.relationships',
    persona: 'ASSISTANT_TRAINER',
    labelKey: 'navigationRelationships',
  },
];

interface TrainerAssistantExperienceNavigatorProps {
  direction: TextDirection;
  locale: 'en' | 'ar';
  t: (key: TranslationKey) => string;
}

export function TrainerAssistantExperienceNavigator({
  direction,
  locale,
  t,
}: TrainerAssistantExperienceNavigatorProps) {
  const { state } = useAuthSession();

  if (state.status !== 'authenticated' || !state.session) {
    return (
      <RoleAwareNavigator
        direction={direction}
        locale={locale}
        renderRoute={() => null}
        routes={staffRoutes}
        t={t}
        workspaceContext={null}
      />
    );
  }

  return (
    <AuthenticatedTrainerAssistantExperienceNavigator
      direction={direction}
      generation={state.session.generation}
      locale={locale}
      t={t}
    />
  );
}

interface AuthenticatedTrainerAssistantExperienceNavigatorProps
  extends TrainerAssistantExperienceNavigatorProps {
  generation: number;
}

function AuthenticatedTrainerAssistantExperienceNavigator({
  direction,
  generation,
  locale,
  t,
}: AuthenticatedTrainerAssistantExperienceNavigatorProps) {
  const { controller, state } = useAuthSession();
  const apiClient = useMemo(() => createApiClient({ auth: controller.authSeam }), [controller]);
  const workspaceQuery = useQuery({
    enabled: state.status === 'authenticated' && state.session?.generation === generation,
    queryKey: [protectedQueryScope, generation, 'staff', 'workspace-context'],
    queryFn: ({ signal }) => fetchMyWorkspaceContexts({ apiClient, signal }),
  });
  const staffContext: StaffWorkspaceResolution | null = useMemo(() => {
    if (!workspaceQuery.data) return null;
    return resolveTrainerAssistantWorkspaceContext({ generation, rows: workspaceQuery.data });
  }, [generation, workspaceQuery.data]);
  const readyContext = staffContext?.status === 'ready' ? staffContext : null;

  return (
    <RoleAwareNavigator
      direction={direction}
      locale={locale}
      renderRoute={({ route }) =>
        readyContext ? (
          <StaffExperienceScreen
            apiClient={apiClient}
            context={readyContext}
            direction={direction}
            routeKind={route.id.endsWith('.relationships') ? 'relationships' : 'home'}
            t={t}
          />
        ) : null
      }
      routes={staffRoutes}
      t={t}
      workspaceContext={readyContext?.workspaceContext ?? null}
    />
  );
}
