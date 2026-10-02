import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '@/api';
import type { RelationshipId } from '@/contracts';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import type { NavigationWorkspaceContext } from '@/navigation';
import { protectedQueryScope } from '@/query';
import { useTheme, type ThemeTokens } from '@/theme';

import { fetchTraineeRelationshipDashboard } from './api';
import type { TraineeContextResolution } from './guards';

interface TraineeHomeScreenProps {
  apiClient: ApiClient;
  context: Extract<TraineeContextResolution, { status: 'ready' }>;
  direction: TextDirection;
  relationshipId?: RelationshipId;
  t: (key: TranslationKey) => string;
}

export function TraineeHomeScreen({
  apiClient,
  context,
  direction,
  relationshipId,
  t,
}: TraineeHomeScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const dashboardQuery = useQuery({
    enabled: Boolean(relationshipId),
    queryKey: traineeRelationshipDashboardKey(context.workspaceContext, relationshipId),
    queryFn: ({ signal }) =>
      fetchTraineeRelationshipDashboard({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: relationshipId as RelationshipId,
        signal,
      }),
  });
  const dashboard = dashboardQuery.data;

  return (
    <View style={styles.screen} testID="trainee-home-screen">
      <Text accessibilityRole="header" style={styles.title}>
        {t('traineeHomeTitle')}
      </Text>
      <Text style={styles.subtitle}>{context.workspace.name}</Text>

      <View style={styles.section}>
        <SummaryRow direction={direction} label={t('traineeWorkspace')} value={context.workspace.name} />
        <SummaryRow direction={direction} label={t('traineeMembership')} value={context.membership.status} />
        <SummaryRow direction={direction} label={t('traineePersona')} value="TRAINEE" />
      </View>

      {!relationshipId ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('traineeRelationshipNotSelected')}
        </Text>
      ) : dashboardQuery.isLoading ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('traineeOverviewLoading')}
        </Text>
      ) : dashboardQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('traineeOverviewUnavailable')}
        </Text>
      ) : dashboard ? (
        <View style={styles.section} testID="trainee-dashboard-summary">
          <SummaryRow
            direction={direction}
            label={t('traineeRelationshipStatus')}
            value={dashboard.relationship.status}
          />
          <SummaryRow direction={direction} label={t('traineeAssignedStaff')} value={String(dashboard.assignedStaff.length)} />
          <SummaryRow
            direction={direction}
            label={t('traineeVisibleSections')}
            value={visibleSections(dashboard.access.sections).join(', ') || t('traineeNone')}
          />
          {typeof dashboard.training?.summary?.completedSessions === 'number' ? (
            <SummaryRow
              direction={direction}
              label={t('traineeCompletedSessions')}
              value={String(dashboard.training.summary.completedSessions)}
            />
          ) : null}
          {dashboard.nutrition?.activePlan?.name ? (
            <SummaryRow
              direction={direction}
              label={t('traineeActiveNutritionPlan')}
              value={dashboard.nutrition.activePlan.name}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

export function traineeRelationshipDashboardKey(
  context: NavigationWorkspaceContext,
  relationshipId?: RelationshipId,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.generation,
    'trainee',
    'relationship-dashboard',
    {
      workspaceId: context.workspaceId,
      membershipId: context.membershipId,
      relationshipId: relationshipId ?? null,
    },
  ] as const;
}

function SummaryRow({ direction, label, value }: { direction: TextDirection; label: string; value: string }) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function visibleSections(sections: Record<string, boolean | undefined>): string[] {
  return Object.entries(sections)
    .filter(([, enabled]) => Boolean(enabled))
    .map(([key]) => key);
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    screen: {
      width: '100%',
      maxWidth: 560,
      gap: theme.spacing.md,
      padding: theme.spacing.lg,
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      direction,
    },
    title: {
      color: theme.colors.foreground,
      fontSize: theme.typography.title,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    subtitle: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.body,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    section: {
      gap: theme.spacing.sm,
    },
    row: {
      minHeight: 36,
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
    },
    rowLabel: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.caption,
      writingDirection: direction,
    },
    rowValue: {
      flexShrink: 1,
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'left' : 'right',
      writingDirection: 'ltr',
    },
    muted: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.body,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    error: {
      color: theme.colors.danger,
      fontSize: theme.typography.body,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
  });
}
