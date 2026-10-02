import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthPanel, useAuthSession, type AuthState } from '@/auth';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { AccessDeniedMessage, resolveAccessDecision, type PermissionAccessFacts } from '@/permissions';
import { useTheme, type ThemeTokens } from '@/theme';

import {
  createNavigationIdentity,
  personaLabels,
  personaRoutes,
  routeBelongsToPersona,
  selectMobilePersona,
  type NavigationWorkspaceContext,
  type PersonaRoute,
  type RoleAwareRouteId,
} from './personas';

export interface NavigationSurfaceProps {
  authState: AuthState;
  direction: TextDirection;
  locale: 'en' | 'ar';
  t: (key: TranslationKey) => string;
  workspaceContext?: NavigationWorkspaceContext | null;
  accessFacts?: PermissionAccessFacts | null;
  initialRouteId?: RoleAwareRouteId;
  routes?: PersonaRoute[];
  renderAuth?: () => ReactNode;
}

export type RoleAwareNavigatorProps = Omit<NavigationSurfaceProps, 'authState' | 'renderAuth'>;

export function RoleAwareNavigator(props: RoleAwareNavigatorProps) {
  const { state } = useAuthSession();
  return (
    <NavigationSurface
      {...props}
      authState={state}
      renderAuth={() => <AuthPanel direction={props.direction} t={props.t} />}
    />
  );
}

export function NavigationSurface({
  authState,
  direction,
  locale,
  t,
  workspaceContext,
  accessFacts,
  initialRouteId,
  routes,
  renderAuth,
}: NavigationSurfaceProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const authenticatedSession =
    authState.status === 'authenticated' && authState.session ? authState.session : null;
  const authGeneration = authenticatedSession?.generation ?? null;
  const selection = selectMobilePersona({ authGeneration, workspaceContext });

  if (authState.status === 'initializing') {
    return (
      <View accessibilityRole="summary" style={styles.panel}>
        <Text style={styles.title}>{t('navigationInitializing')}</Text>
      </View>
    );
  }

  if (!authenticatedSession) {
    return (
      <View style={styles.stack}>
        <Text accessibilityRole="header" style={styles.title}>
          {t('navigationAuthFlow')}
        </Text>
        {renderAuth ? renderAuth() : null}
      </View>
    );
  }

  if (selection.status !== 'selected') {
    const label =
      selection.status === 'ambiguous'
        ? t('navigationAmbiguousPersona')
        : selection.status === 'unsupported'
          ? t('navigationUnsupportedPersona')
          : t('navigationContextUnavailable');

    return (
      <View accessibilityRole="alert" style={styles.panel}>
        <Text style={styles.title}>{label}</Text>
      </View>
    );
  }

  const identity = createNavigationIdentity({
    generation: authenticatedSession.generation,
    persona: selection.persona,
    workspaceId: selection.workspaceId,
    membershipId: selection.membershipId,
  });

  return (
    <PersonaNavigator
      accessFacts={accessFacts}
      currentGeneration={authenticatedSession.generation}
      direction={direction}
      identity={identity}
      initialRouteId={initialRouteId}
      locale={locale}
      personaLabel={t(personaLabels[selection.persona])}
      routes={(routes ?? personaRoutes[selection.persona]).filter((route) =>
        routeBelongsToPersona(route, selection.persona),
      )}
      t={t}
    />
  );
}

interface PersonaNavigatorProps {
  accessFacts?: PermissionAccessFacts | null;
  currentGeneration: number;
  direction: TextDirection;
  identity: string;
  initialRouteId?: RoleAwareRouteId;
  locale: 'en' | 'ar';
  personaLabel: string;
  routes: PersonaRoute[];
  t: (key: TranslationKey) => string;
}

function PersonaNavigator({
  accessFacts,
  currentGeneration,
  direction,
  identity,
  initialRouteId,
  locale,
  personaLabel,
  routes,
  t,
}: PersonaNavigatorProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const defaultRouteId = routes.some((route) => route.id === initialRouteId)
    ? initialRouteId
    : routes[0]?.id;
  const [routeState, setRouteState] = useState({ identity, activeRouteId: defaultRouteId });
  const activeRouteId =
    routeState.identity === identity && routes.some((route) => route.id === routeState.activeRouteId)
      ? routeState.activeRouteId
      : defaultRouteId;

  const activeRoute = useMemo(
    () => routes.find((route) => route.id === activeRouteId) ?? routes[0],
    [activeRouteId, routes],
  );
  const accessDecision = activeRoute?.requiredPermission
    ? resolveAccessDecision({
        permission: activeRoute.requiredPermission,
        currentGeneration,
        facts: accessFacts,
      })
    : ({ state: 'allowed', reason: 'allowed' } as const);

  return (
    <View style={styles.stack}>
      <Text accessibilityRole="header" style={styles.title}>
        {personaLabel}
      </Text>
      <View style={styles.navRow}>
        {routes.map((route) => {
          const selected = route.id === activeRoute?.id;
          return (
            <Pressable
              accessibilityLabel={t(route.labelKey)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={route.id}
              onPress={() => setRouteState({ identity, activeRouteId: route.id })}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabText, selected && styles.tabSelectedText]}>
                {t(route.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {accessDecision.state === 'allowed' ? (
        <View
          accessibilityRole="summary"
          style={styles.screen}
          testID={activeRoute ? `navigation-screen-${activeRoute.id}` : 'navigation-screen'}
        >
          <Text style={styles.screenTitle}>
            {activeRoute ? t(activeRoute.labelKey) : personaLabel}
          </Text>
        </View>
      ) : (
        <AccessDeniedMessage decision={accessDecision} direction={direction} locale={locale} />
      )}
    </View>
  );
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    stack: {
      width: '100%',
      maxWidth: 520,
      gap: theme.spacing.md,
      direction,
    },
    panel: {
      width: '100%',
      maxWidth: 520,
      minHeight: 72,
      justifyContent: 'center',
      padding: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      direction,
    },
    title: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    navRow: {
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    tab: {
      minHeight: 44,
      minWidth: 96,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    tabSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.focus,
      borderWidth: 2,
    },
    tabPressed: {
      backgroundColor: theme.colors.pressed,
    },
    tabText: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      textAlign: 'center',
      writingDirection: direction,
    },
    tabSelectedText: {
      color: theme.colors.primaryForeground,
      fontWeight: '700',
    },
    screen: {
      minHeight: 88,
      justifyContent: 'center',
      padding: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    screenTitle: {
      color: theme.colors.foreground,
      fontSize: theme.typography.title,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
  });
}
