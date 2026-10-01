import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AuthPanel, AuthProvider } from '@/auth';
import { publicClientConfig } from '@/config/publicConfig';
import { getDeviceLocaleTags } from '@/i18n/device';
import {
  SUPPORTED_LOCALES,
  getLocaleDirection,
  resolveLocale,
  type SupportedLocale,
  type TextDirection,
} from '@/i18n/locales';
import { translate } from '@/i18n/messages';
import { getStoredLocale, persistLocale } from '@/i18n/persistence';
import { applyLocaleDirection } from '@/i18n/rtl';
import { AccessProvider } from '@/permissions';
import { AppInfrastructureProvider } from '@/providers';
import {
  ThemeProvider,
  appearanceModes,
  themeIds,
  useTheme,
  type AppearanceMode,
  type ThemeId,
  type ThemeTokens,
} from '@/theme';

export default function App() {
  return (
    <AppInfrastructureProvider>
      <ThemeProvider>
        <AuthProvider>
          <AccessProvider>
            <FoundationPreview />
          </AccessProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppInfrastructureProvider>
  );
}

function FoundationPreview() {
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    resolveLocale({ deviceLocales: getDeviceLocaleTags() }),
  );
  const [requiresRestart, setRequiresRestart] = useState(
    () => applyLocaleDirection(locale).requiresRestart,
  );
  const {
    theme,
    themeId,
    appearanceMode,
    resolvedAppearance,
    setThemeId,
    setAppearanceMode,
  } = useTheme();
  const direction = getLocaleDirection(locale);
  const t = useMemo(
    () => (key: Parameters<typeof translate>[1]) => translate(locale, key),
    [locale],
  );
  const styles = createStyles(theme, direction);

  useEffect(() => {
    let isMounted = true;

    async function loadLocalePreference() {
      const storedLocale = await getStoredLocale();
      const resolvedLocale = resolveLocale({
        storedLocale,
        deviceLocales: getDeviceLocaleTags(),
      });
      const directionState = applyLocaleDirection(resolvedLocale);

      if (isMounted) {
        setLocale(resolvedLocale);
        setRequiresRestart(directionState.requiresRestart);
      }
    }

    void loadLocalePreference();

    return () => {
      isMounted = false;
    };
  }, []);

  async function selectLocale(nextLocale: SupportedLocale) {
    const directionState = applyLocaleDirection(nextLocale);

    setLocale(nextLocale);
    setRequiresRestart(directionState.requiresRestart);
    await persistLocale(nextLocale);
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('appTitle')}
      </Text>
      <Text style={styles.subtitle}>
        {t('appSubtitle')} - {resolvedAppearance}
      </Text>
      <Text style={styles.environment}>
        Environment: {publicClientConfig.appEnvironment}
      </Text>

      <View style={styles.panel}>
        <Text style={styles.label}>{t('languageLabel')}</Text>
        <View style={styles.controlRow}>
          {(['en', 'ar'] as const).map((option) => (
            <TokenButton
              key={option}
              label={SUPPORTED_LOCALES[option].nativeLabel}
              selected={locale === option}
              onPress={() => void selectLocale(option)}
            />
          ))}
        </View>

        <Text style={styles.label}>Appearance</Text>
        <View style={styles.controlRow}>
          {appearanceModes.map((mode) => (
            <TokenButton
              key={mode}
              label={mode}
              selected={appearanceMode === mode}
              onPress={() => setAppearanceMode(mode as AppearanceMode)}
            />
          ))}
        </View>

        <Text style={styles.label}>Theme</Text>
        <View style={styles.controlRow}>
          {themeIds.map((id) => (
            <TokenButton
              key={id}
              label={id}
              selected={themeId === id}
              onPress={() => setThemeId(id as ThemeId)}
            />
          ))}
        </View>

        <View style={styles.stateRow}>
          <SemanticState label="Success" color={theme.colors.success} />
          <SemanticState label="Warning" color={theme.colors.warning} />
          <SemanticState label="Danger" color={theme.colors.danger} />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled
          style={styles.disabledButton}
        >
          <Text style={styles.disabledButtonText}>Disabled state</Text>
        </Pressable>
      </View>

      <AuthPanel direction={direction} t={t} />

      {requiresRestart ? (
        <Text style={styles.directionNotice}>{t('directionNotice')}</Text>
      ) : null}

      <StatusBar style={resolvedAppearance === 'dark' ? 'light' : 'dark'} />
    </View>
  );
}

type TokenButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

function TokenButton({ label, selected, onPress }: TokenButtonProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, 'ltr');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}
    >
      <Text style={[styles.optionText, selected && styles.optionSelectedText]}>
        {label}
      </Text>
    </Pressable>
  );
}

type SemanticStateProps = {
  label: string;
  color: string;
};

function SemanticState({ label, color }: SemanticStateProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, 'ltr');

  return (
    <View style={styles.stateItem}>
      <View style={[styles.stateSwatch, { backgroundColor: color }]} />
      <Text style={styles.stateLabel}>{label}</Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.background,
      direction,
    },
    title: {
      alignSelf: 'stretch',
      color: theme.colors.foreground,
      fontSize: theme.typography.title,
      fontWeight: '700',
      textAlign: 'center',
      writingDirection: direction,
    },
    subtitle: {
      alignSelf: 'stretch',
      marginTop: theme.spacing.sm,
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.body,
      textAlign: 'center',
      writingDirection: direction,
    },
    environment: {
      alignSelf: 'stretch',
      marginTop: theme.spacing.sm,
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.caption,
      textAlign: 'center',
      writingDirection: 'ltr',
    },
    panel: {
      width: '100%',
      maxWidth: 420,
      marginTop: theme.spacing.xl,
      padding: theme.spacing.md,
      gap: theme.spacing.md,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.lg,
      borderWidth: 1,
    },
    label: {
      color: theme.colors.foreground,
      fontSize: theme.typography.caption,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      textTransform: 'uppercase',
      writingDirection: direction,
    },
    controlRow: {
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    option: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    optionSelected: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.focus,
      borderWidth: 2,
    },
    optionPressed: {
      backgroundColor: theme.colors.pressed,
    },
    optionText: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      textTransform: 'capitalize',
    },
    optionSelectedText: {
      color: theme.colors.primaryForeground,
      fontWeight: '700',
    },
    stateRow: {
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    stateItem: {
      minHeight: 36,
      alignItems: 'center',
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      gap: theme.spacing.sm,
      paddingHorizontal: theme.spacing.sm,
    },
    stateSwatch: {
      width: 16,
      height: 16,
      borderRadius: theme.radius.sm,
    },
    stateLabel: {
      color: theme.colors.foreground,
      fontSize: theme.typography.caption,
    },
    disabledButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      backgroundColor: theme.colors.disabled,
      borderRadius: theme.radius.md,
    },
    disabledButtonText: {
      color: theme.colors.disabledForeground,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    directionNotice: {
      alignSelf: 'stretch',
      color: theme.colors.warning,
      fontSize: theme.typography.caption,
      marginTop: theme.spacing.md,
      textAlign: 'center',
      writingDirection: direction,
    },
  });
}
