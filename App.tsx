import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  ThemeProvider,
  appearanceModes,
  themeIds,
  useTheme,
  type AppearanceMode,
  type ThemeId,
  type ThemeTokens,
} from './src/theme';

export default function App() {
  return (
    <ThemeProvider>
      <ThemePreview />
    </ThemeProvider>
  );
}

function ThemePreview() {
  const {
    theme,
    themeId,
    appearanceMode,
    resolvedAppearance,
    setThemeId,
    setAppearanceMode,
  } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hassan Gym & Fitness Coaching</Text>
      <Text style={styles.subtitle}>
        Semantic theme foundation - {resolvedAppearance}
      </Text>

      <View style={styles.panel}>
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
  const styles = createStyles(theme);

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
  const styles = createStyles(theme);

  return (
    <View style={styles.stateItem}>
      <View style={[styles.stateSwatch, { backgroundColor: color }]} />
      <Text style={styles.stateLabel}>{label}</Text>
    </View>
  );
}

function createStyles(theme: ThemeTokens) {
  return StyleSheet.create({
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.lg,
      backgroundColor: theme.colors.background,
    },
    title: {
      color: theme.colors.foreground,
      fontSize: theme.typography.title,
      fontWeight: '700',
      textAlign: 'center',
    },
    subtitle: {
      marginTop: theme.spacing.sm,
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.body,
      textAlign: 'center',
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
      textTransform: 'uppercase',
    },
    controlRow: {
      flexDirection: 'row',
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
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    stateItem: {
      minHeight: 36,
      alignItems: 'center',
      flexDirection: 'row',
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
  });
}
