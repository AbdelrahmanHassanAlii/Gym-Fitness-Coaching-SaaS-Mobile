import { Controller } from 'react-hook-form';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { createFormConfig, useForm } from '@/forms';
import type { TranslationKey } from '@/i18n/messages';
import type { TextDirection } from '@/i18n/locales';
import { useTheme, type ThemeTokens } from '@/theme';
import { useAuthSession } from './AuthProvider';

interface AuthPanelProps {
  direction: TextDirection;
  t: (key: TranslationKey) => string;
}

interface AuthFormValues {
  identifier: string;
  password: string;
}

export function AuthPanel({ direction, t }: AuthPanelProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const { state, login, logout } = useAuthSession();
  const form = useForm<AuthFormValues>(
    createFormConfig({
      defaultValues: { identifier: '', password: '' },
    }),
  );
  const isBusy = state.status === 'initializing' || form.formState.isSubmitting;

  async function submit(values: AuthFormValues) {
    await login(values).catch(() => undefined);
  }

  if (state.status === 'authenticated') {
    const userName = state.session?.user
      ? `${state.session.user.firstName} ${state.session.user.lastName}`
      : t('authSignedInFallback');

    return (
      <View style={styles.authPanel}>
        <Text accessibilityRole="header" style={styles.authTitle}>
          {t('authSessionTitle')}
        </Text>
        <Text style={styles.authMessage}>{userName}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void logout().catch(() => undefined)}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>{t('authLogout')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.authPanel}>
      <Text accessibilityRole="header" style={styles.authTitle}>
        {t('authLoginTitle')}
      </Text>
      <Controller
        control={form.control}
        name="identifier"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('authIdentifier')}
            autoCapitalize="none"
            editable={!isBusy}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder={t('authIdentifier')}
            placeholderTextColor={theme.colors.mutedForeground}
            style={styles.input}
            textContentType="username"
            value={value}
          />
        )}
      />
      <Controller
        control={form.control}
        name="password"
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={t('authPassword')}
            editable={!isBusy}
            onBlur={onBlur}
            onChangeText={onChange}
            placeholder={t('authPassword')}
            placeholderTextColor={theme.colors.mutedForeground}
            secureTextEntry
            style={styles.input}
            textContentType="password"
            value={value}
          />
        )}
      />
      {state.status === 'mfa_required' ? (
        <Text style={styles.authMessage}>{t('authMfaRequired')}</Text>
      ) : null}
      {state.status === 'security_failure' ? (
        <Text accessibilityRole="alert" style={styles.authError}>
          {t('authSecurityFailure')}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isBusy}
        onPress={() => void form.handleSubmit(submit)()}
        style={[styles.primaryButton, isBusy && styles.disabledButton]}
      >
        <Text style={styles.primaryButtonText}>
          {isBusy ? t('authLoading') : t('authLogin')}
        </Text>
      </Pressable>
    </View>
  );
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    authPanel: {
      width: '100%',
      maxWidth: 420,
      marginTop: theme.spacing.lg,
      gap: theme.spacing.sm,
    },
    authTitle: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    authMessage: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.caption,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    authError: {
      color: theme.colors.danger,
      fontSize: theme.typography.caption,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    input: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    primaryButton: {
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
    primaryButtonText: {
      color: theme.colors.primaryForeground,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
  });
}
