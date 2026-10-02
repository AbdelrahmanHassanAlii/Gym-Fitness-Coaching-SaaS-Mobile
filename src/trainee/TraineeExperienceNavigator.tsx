import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createApiClient } from '@/api';
import { useAuthSession } from '@/auth';
import type { RelationshipId } from '@/contracts';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { RoleAwareNavigator, type PersonaRoute } from '@/navigation';
import { protectedQueryScope } from '@/query';

import { fetchMyWorkspaceContexts } from './api';
import { resolveTraineeWorkspaceContext, type TraineeContextResolution } from './guards';
import { TraineeHomeScreen } from './TraineeHomeScreen';

const traineeRoutes: PersonaRoute[] = [
  { id: 'trainee.home', persona: 'TRAINEE', labelKey: 'navigationHome' },
];

interface TraineeExperienceNavigatorProps {
  direction: TextDirection;
  locale: 'en' | 'ar';
  relationshipId?: RelationshipId;
  t: (key: TranslationKey) => string;
}

export function TraineeExperienceNavigator({
  direction,
  locale,
  relationshipId,
  t,
}: TraineeExperienceNavigatorProps) {
  const { controller, state } = useAuthSession();
  const generation =
    state.status === 'authenticated' ? state.session?.generation ?? null : null;
  const apiClient = useMemo(
    () => (generation === null ? null : createApiClient({ auth: controller.authSeam })),
    [controller, generation],
  );
  const workspaceQuery = useQuery({
    enabled: generation !== null && apiClient !== null,
    queryKey:
      generation === null
        ? [protectedQueryScope, 'no-session', 'trainee', 'workspace-context']
        : [protectedQueryScope, generation, 'trainee', 'workspace-context'],
    queryFn: ({ signal }) => fetchMyWorkspaceContexts({ apiClient: apiClient as NonNullable<typeof apiClient>, signal }),
  });
  const traineeContext: TraineeContextResolution | null = useMemo(() => {
    if (generation === null || !workspaceQuery.data) return null;
    return resolveTraineeWorkspaceContext({ generation, rows: workspaceQuery.data });
  }, [generation, workspaceQuery.data]);
  const readyContext = traineeContext?.status === 'ready' ? traineeContext : null;

  return (
    <RoleAwareNavigator
      direction={direction}
      locale={locale}
      renderRoute={({ route }) =>
        route.id === 'trainee.home' && readyContext && apiClient ? (
          <TraineeHomeScreen
            apiClient={apiClient}
            context={readyContext}
            direction={direction}
            relationshipId={relationshipId}
            t={t}
          />
        ) : null
      }
      routes={traineeRoutes}
      t={t}
      workspaceContext={readyContext?.workspaceContext ?? null}
    />
  );
}
