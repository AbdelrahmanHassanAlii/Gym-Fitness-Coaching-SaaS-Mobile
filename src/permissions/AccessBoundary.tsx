import type { PropsWithChildren, ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

import type { SupportedLocale, TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { translate } from '@/i18n/messages';
import { useTheme, type ThemeTokens } from '@/theme';
import { isAccessAllowed, type AccessDecision } from './model';

export type AccessBoundaryMode = 'hide' | 'disabled' | 'fallback';

export interface AccessBoundaryProps extends PropsWithChildren {
  decision: AccessDecision;
  mode?: AccessBoundaryMode;
  fallback?: ReactNode;
  locale?: SupportedLocale;
  direction?: TextDirection;
}

export function AccessBoundary({
  children,
  decision,
  mode = 'fallback',
  fallback,
  locale = 'en',
  direction = 'ltr',
}: AccessBoundaryProps) {
  if (isAccessAllowed(decision)) return <>{children}</>;
  if (mode === 'hide') return null;

  const message = accessMessageForDecision(decision);
  if (mode === 'disabled') {
    return (
      <View
        accessibilityState={{ disabled: true }}
        accessibilityLabel={translate(locale, message)}
      >
        {children}
      </View>
    );
  }

  return (
    <>
      {fallback ?? (
        <AccessDeniedMessage decision={decision} locale={locale} direction={direction} />
      )}
    </>
  );
}

export interface AccessControlledPressableProps {
  decision: AccessDecision;
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  locale?: SupportedLocale;
  direction?: TextDirection;
  children?: ReactNode;
}

export function AccessControlledPressable({
  decision,
  label,
  onPress,
  locale = 'en',
  direction = 'ltr',
  children,
}: AccessControlledPressableProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const allowed = isAccessAllowed(decision);
  const message = translate(locale, accessMessageForDecision(decision));
  const accessibilityLabel = allowed ? label : `${label}. ${message}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: !allowed }}
      disabled={!allowed}
      onPress={allowed ? onPress : undefined}
      style={[styles.button, !allowed && styles.disabledButton]}
    >
      {children ?? <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

export interface AccessDeniedMessageProps {
  decision: AccessDecision;
  locale?: SupportedLocale;
  direction?: TextDirection;
}

export function AccessDeniedMessage({
  decision,
  locale = 'en',
  direction = 'ltr',
}: AccessDeniedMessageProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);

  return (
    <Text accessibilityRole="alert" style={styles.message}>
      {translate(locale, accessMessageForDecision(decision))}
    </Text>
  );
}

export function accessMessageForDecision(decision: AccessDecision): TranslationKey {
  if (decision.state === 'denied') return 'accessDenied';
  if (decision.state === 'unavailable') return 'accessUnavailable';
  return 'accessChecking';
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    button: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.md,
    },
    disabledButton: {
      backgroundColor: theme.colors.disabled,
    },
    buttonText: {
      color: theme.colors.primaryForeground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      writingDirection: direction,
    },
    message: {
      color: theme.colors.danger,
      fontSize: theme.typography.caption,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
  });
}
