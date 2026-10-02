import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AuthPanel, useAuthSession, type AuthState } from '@/auth';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { AccessDeniedMessage, resolveAccessDecision, type PermissionAccessFacts } from '@/permissions';
import { useTheme, type ThemeTokens } from '@/theme';

import {
  createNavigationIdentity,
  personaLabels,
  personaRoutes,
  resolveInitialRouteId,
  routeBelongsToPersona,
  selectMobilePersona,
  type NavigationWorkspaceContext,
  type PersonaRoute,
  type RoleAwareRouteId,
} from './personas';

type RootStackParamList = {
  Initializing: undefined;
  Auth: undefined;
  Unavailable: undefined;
  Persona: undefined;
};

type PersonaTabParamList = Partial<Record<RoleAwareRouteId, undefined>>;

const RootStack = createNativeStackNavigator<RootStackParamList>();
const PersonaTabs = createBottomTabNavigator<PersonaTabParamList>();

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
  renderRoute?: (input: RouteRenderInput) => ReactNode;
}

export interface RouteRenderInput {
  currentGeneration: number;
  direction: TextDirection;
  locale: 'en' | 'ar';
  route: PersonaRoute;
  t: (key: TranslationKey) => string;
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
  renderRoute,
  routes,
  renderAuth,
}: NavigationSurfaceProps) {
  const authenticatedSession =
    authState.status === 'authenticated' && authState.session ? authState.session : null;
  const authGeneration = authenticatedSession?.generation ?? null;
  const selection = selectMobilePersona({ authGeneration, workspaceContext });
  const rootState =
    authState.status === 'initializing'
      ? 'initializing'
      : !authenticatedSession
        ? 'auth'
        : selection.status === 'selected'
          ? 'persona'
          : 'unavailable';
  const unavailableMessage =
    selection.status === 'ambiguous'
      ? 'navigationAmbiguousPersona'
      : selection.status === 'unsupported'
        ? 'navigationUnsupportedPersona'
        : 'navigationContextUnavailable';
  const selectedRoutes =
    selection.status === 'selected'
      ? (routes ?? personaRoutes[selection.persona]).filter((route) =>
          routeBelongsToPersona(route, selection.persona),
        )
      : [];
  const navigationIdentity =
    selection.status === 'selected' && authenticatedSession
      ? createNavigationIdentity({
          generation: authenticatedSession.generation,
          persona: selection.persona,
          workspaceId: selection.workspaceId,
          membershipId: selection.membershipId,
        })
      : `${rootState}:${authGeneration ?? 'none'}`;

  return (
    <NavigationContainer key={navigationIdentity}>
      <RootStack.Navigator
        initialRouteName={
          rootState === 'initializing'
            ? 'Initializing'
            : rootState === 'auth'
              ? 'Auth'
              : rootState === 'persona'
                ? 'Persona'
                : 'Unavailable'
        }
        screenOptions={{
          animation: 'none',
          headerShown: false,
        }}
      >
        <RootStack.Screen name="Initializing">
          {() => (
            <NavigationStatusScreen
              direction={direction}
              label={t('navigationInitializing')}
              role="summary"
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Auth">
          {() => (
            <NavigationFrame direction={direction}>
              <AuthHeader direction={direction} label={t('navigationAuthFlow')} />
              {renderAuth ? renderAuth() : null}
            </NavigationFrame>
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Unavailable">
          {() => (
            <NavigationStatusScreen
              direction={direction}
              label={t(unavailableMessage)}
              role="alert"
            />
          )}
        </RootStack.Screen>
        <RootStack.Screen name="Persona">
          {() =>
            rootState === 'persona' && authenticatedSession && selection.status === 'selected' ? (
              <PersonaTabNavigator
                accessFacts={accessFacts}
                currentGeneration={authenticatedSession.generation}
                direction={direction}
                initialRouteId={initialRouteId}
                locale={locale}
                personaLabel={t(personaLabels[selection.persona])}
                renderRoute={renderRoute}
                routes={selectedRoutes}
                t={t}
              />
            ) : (
              <NavigationStatusScreen
                direction={direction}
                label={t('navigationContextUnavailable')}
                role="alert"
              />
            )
          }
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  );
}

interface PersonaTabNavigatorProps {
  accessFacts?: PermissionAccessFacts | null;
  currentGeneration: number;
  direction: TextDirection;
  initialRouteId?: RoleAwareRouteId;
  locale: 'en' | 'ar';
  personaLabel: string;
  renderRoute?: (input: RouteRenderInput) => ReactNode;
  routes: PersonaRoute[];
  t: (key: TranslationKey) => string;
}

function PersonaTabNavigator({
  accessFacts,
  currentGeneration,
  direction,
  initialRouteId,
  locale,
  personaLabel,
  renderRoute,
  routes,
  t,
}: PersonaTabNavigatorProps) {
  const { theme } = useTheme();
  const initialRouteName = resolveInitialRouteId(routes, initialRouteId);

  return (
    <PersonaTabs.Navigator
      backBehavior="firstRoute"
      initialRouteName={initialRouteName}
      screenOptions={{
        headerTitle: personaLabel,
        headerTitleAlign: direction === 'rtl' ? 'center' : 'left',
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.foreground,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
          minHeight: 56,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.caption,
          writingDirection: direction,
        },
      }}
    >
      {routes.map((route) => (
        <PersonaTabs.Screen
          key={route.id}
          name={route.id}
          options={{
            title: t(route.labelKey),
            tabBarAccessibilityLabel: t(route.labelKey),
          }}
        >
          {() => (
            <RouteScreen
              accessFacts={accessFacts}
              currentGeneration={currentGeneration}
              direction={direction}
              locale={locale}
              renderRoute={renderRoute}
              route={route}
              t={t}
            />
          )}
        </PersonaTabs.Screen>
      ))}
    </PersonaTabs.Navigator>
  );
}

interface RouteScreenProps {
  accessFacts?: PermissionAccessFacts | null;
  currentGeneration: number;
  direction: TextDirection;
  locale: 'en' | 'ar';
  renderRoute?: (input: RouteRenderInput) => ReactNode;
  route: PersonaRoute;
  t: (key: TranslationKey) => string;
}

function RouteScreen({
  accessFacts,
  currentGeneration,
  direction,
  locale,
  renderRoute,
  route,
  t,
}: RouteScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const accessDecision = route.requiredPermission
    ? resolveAccessDecision({
        permission: route.requiredPermission,
        currentGeneration,
        facts: accessFacts,
      })
    : ({ state: 'allowed', reason: 'allowed' } as const);

  return (
    <NavigationFrame direction={direction}>
      {accessDecision.state === 'allowed' ? (
        (renderRoute?.({ currentGeneration, direction, locale, route, t }) ?? (
          <View
            accessibilityRole="summary"
            style={styles.screen}
            testID={`navigation-screen-${route.id}`}
          >
            <Text style={styles.screenTitle}>{t(route.labelKey)}</Text>
          </View>
        ))
      ) : (
        <AccessDeniedMessage decision={accessDecision} direction={direction} locale={locale} />
      )}
    </NavigationFrame>
  );
}

function NavigationStatusScreen({
  direction,
  label,
  role,
}: {
  direction: TextDirection;
  label: string;
  role: 'alert' | 'summary';
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);

  return (
    <NavigationFrame direction={direction}>
      <View accessibilityRole={role} style={styles.panel}>
        <Text style={styles.title}>{label}</Text>
      </View>
    </NavigationFrame>
  );
}

function NavigationFrame({
  children,
  direction,
}: {
  children: ReactNode;
  direction: TextDirection;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);

  return <View style={styles.frame}>{children}</View>;
}

function AuthHeader({ direction, label }: { direction: TextDirection; label: string }) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  return (
    <Text accessibilityRole="header" style={styles.title}>
      {label}
    </Text>
  );
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    frame: {
      flex: 1,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.background,
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
    screen: {
      width: '100%',
      maxWidth: 520,
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
