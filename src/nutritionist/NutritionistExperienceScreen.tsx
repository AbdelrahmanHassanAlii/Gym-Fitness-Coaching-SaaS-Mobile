import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '@/api';
import type { RelationshipId } from '@/contracts';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { protectedQueryScope } from '@/query';
import { useTheme, type ThemeTokens } from '@/theme';

import {
  fetchNutritionistNutritionAnalytics,
  fetchNutritionistNutritionPlans,
  fetchNutritionistRelationshipDashboard,
  fetchNutritionistRelationships,
} from './api';
import type { NutritionistWorkspaceResolution } from './guards';

type ReadyNutritionistContext = Extract<NutritionistWorkspaceResolution, { status: 'ready' }>;
type NutritionistRouteKind = 'home' | 'relationships';

interface NutritionistExperienceScreenProps {
  apiClient: ApiClient;
  context: ReadyNutritionistContext;
  direction: TextDirection;
  routeKind: NutritionistRouteKind;
  t: (key: TranslationKey) => string;
}

export function NutritionistExperienceScreen({
  apiClient,
  context,
  direction,
  routeKind,
  t,
}: NutritionistExperienceScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<RelationshipId | null>(null);
  const relationshipsQuery = useQuery({
    queryKey: nutritionistRelationshipsKey(context),
    queryFn: ({ signal }) =>
      fetchNutritionistRelationships({
        apiClient,
        workspaceId: context.workspace.id,
        signal,
      }),
  });
  const relationships = useMemo(
    () => relationshipsQuery.data ?? [],
    [relationshipsQuery.data],
  );
  const selectedRelationship = useMemo(
    () =>
      selectedRelationshipId
        ? relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null
        : null,
    [relationships, selectedRelationshipId],
  );
  const relationshipId = selectedRelationship?.id ?? null;
  const dashboardQuery = useQuery({
    enabled: Boolean(relationshipId),
    queryKey: nutritionistRelationshipDashboardKey(context, relationshipId),
    queryFn: ({ signal }) =>
      fetchNutritionistRelationshipDashboard({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: relationshipId as RelationshipId,
        signal,
      }),
  });
  const plansQuery = useQuery({
    enabled: Boolean(relationshipId),
    queryKey: nutritionistNutritionPlansKey(context, relationshipId),
    queryFn: ({ signal }) =>
      fetchNutritionistNutritionPlans({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: relationshipId as RelationshipId,
        signal,
      }),
  });
  const analyticsQuery = useQuery({
    enabled: Boolean(relationshipId),
    queryKey: nutritionistNutritionAnalyticsKey(context, relationshipId),
    queryFn: ({ signal }) =>
      fetchNutritionistNutritionAnalytics({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: relationshipId as RelationshipId,
        signal,
      }),
  });

  return (
    <View style={styles.screen} testID={`nutritionist-${routeKind}-screen`}>
      <Text accessibilityRole="header" style={styles.title}>
        {t('nutritionistHomeTitle')}
      </Text>
      <Text style={styles.subtitle}>{context.workspace.name}</Text>

      <View style={styles.section}>
        <SummaryRow direction={direction} label={t('nutritionistWorkspace')} value={context.workspace.name} />
        <SummaryRow direction={direction} label={t('nutritionistMembership')} value={context.membership.status} />
        <SummaryRow
          direction={direction}
          label={t('nutritionistPersona')}
          value={context.workspaceContext.preferredPersona ?? t('traineeNone')}
        />
      </View>

      {relationshipsQuery.isLoading ? (
        <StatusText direction={direction} label={t('nutritionistRelationshipsLoading')} role="summary" />
      ) : relationshipsQuery.isError ? (
        <StatusText direction={direction} label={t('nutritionistRelationshipsUnavailable')} role="alert" />
      ) : relationships.length === 0 ? (
        <StatusText direction={direction} label={t('nutritionistRelationshipsEmpty')} role="summary" />
      ) : routeKind === 'home' ? (
        <View style={styles.section} testID="nutritionist-home-summary">
          <SummaryRow
            direction={direction}
            label={t('nutritionistVisibleRelationships')}
            value={String(relationships.length)}
          />
          <SummaryRow
            direction={direction}
            label={t('nutritionistFirstRelationshipStatus')}
            value={relationships[0]?.status ?? t('traineeNone')}
          />
        </View>
      ) : (
        <View style={styles.section} testID="nutritionist-relationship-list">
          {relationships.map((relationship) => (
            <Pressable
              accessibilityLabel={`${relationship.id} ${relationship.status}`}
              accessibilityRole="button"
              accessibilityState={{ selected: selectedRelationshipId === relationship.id }}
              key={relationship.id}
              onPress={() => setSelectedRelationshipId(relationship.id)}
              style={({ pressed }) => [
                styles.relationshipRow,
                selectedRelationshipId === relationship.id && styles.relationshipRowSelected,
                pressed && styles.relationshipRowPressed,
              ]}
            >
              <Text style={styles.rowLabel}>{relationship.status}</Text>
              <Text style={styles.rowValue}>{relationship.id}</Text>
            </Pressable>
          ))}
        </View>
      )}

      {routeKind === 'relationships' ? (
        !selectedRelationship ? (
          <StatusText direction={direction} label={t('nutritionistRelationshipSelectPrompt')} role="summary" />
        ) : (
          <NutritionistRelationshipDetail
            analyticsQuery={analyticsQuery}
            direction={direction}
            dashboardQuery={dashboardQuery}
            plansQuery={plansQuery}
            t={t}
          />
        )
      ) : null}
    </View>
  );
}

export function nutritionistRelationshipsKey(context: ReadyNutritionistContext): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'nutritionist',
    'relationships',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
    },
  ] as const;
}

export function nutritionistRelationshipDashboardKey(
  context: ReadyNutritionistContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'nutritionist',
    'relationship-dashboard',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
      relationshipId: relationshipId ?? null,
    },
  ] as const;
}

export function nutritionistNutritionPlansKey(
  context: ReadyNutritionistContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'nutritionist',
    'nutrition-plans',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
      relationshipId: relationshipId ?? null,
      limit: 10,
      includeArchived: false,
    },
  ] as const;
}

export function nutritionistNutritionAnalyticsKey(
  context: ReadyNutritionistContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'nutritionist',
    'nutrition-analytics',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
      relationshipId: relationshipId ?? null,
    },
  ] as const;
}

function NutritionistRelationshipDetail({
  analyticsQuery,
  dashboardQuery,
  direction,
  plansQuery,
  t,
}: {
  analyticsQuery: {
    data?: {
      activePlan: { name: string } | null;
      nutritionTracking: { daysTracked: number; averageAdherenceRate: number | null };
      waterTracking: { daysTracked: number; targetMl: number | null };
    };
    isError: boolean;
    isLoading: boolean;
  };
  dashboardQuery: {
    data?: {
      relationship: { status: string };
      access: { sections: Record<string, boolean | undefined> };
    };
    isError: boolean;
    isLoading: boolean;
  };
  direction: TextDirection;
  plansQuery: {
    data?: {
      data: { id: string; name: string; status: string }[];
      nextCursor?: string | null;
    };
    isError: boolean;
    isLoading: boolean;
  };
  t: (key: TranslationKey) => string;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);

  if (dashboardQuery.isLoading || plansQuery.isLoading || analyticsQuery.isLoading) {
    return <StatusText direction={direction} label={t('nutritionistDetailLoading')} role="summary" />;
  }
  if (dashboardQuery.isError || plansQuery.isError || analyticsQuery.isError) {
    return <StatusText direction={direction} label={t('nutritionistDetailUnavailable')} role="alert" />;
  }
  if (!dashboardQuery.data || !plansQuery.data || !analyticsQuery.data) return null;

  return (
    <View style={styles.section} testID="nutritionist-relationship-detail">
      <SummaryRow
        direction={direction}
        label={t('nutritionistRelationshipStatus')}
        value={dashboardQuery.data.relationship.status}
      />
      <SummaryRow
        direction={direction}
        label={t('nutritionistVisibleSections')}
        value={visibleSections(dashboardQuery.data.access.sections).join(', ') || t('traineeNone')}
      />
      <SummaryRow
        direction={direction}
        label={t('nutritionistActivePlan')}
        value={analyticsQuery.data.activePlan?.name ?? t('traineeNone')}
      />
      <SummaryRow
        direction={direction}
        label={t('nutritionistNutritionPlansShown')}
        value={String(plansQuery.data.data.length)}
      />
      {plansQuery.data.nextCursor ? (
        <Text style={styles.muted} testID="nutritionist-plan-preview-limited">
          {t('nutritionistNutritionPlanPreviewLimited')}
        </Text>
      ) : null}
      <SummaryRow
        direction={direction}
        label={t('nutritionistNutritionTrackedDays')}
        value={String(analyticsQuery.data.nutritionTracking.daysTracked)}
      />
      <SummaryRow
        direction={direction}
        label={t('nutritionistWaterTrackedDays')}
        value={String(analyticsQuery.data.waterTracking.daysTracked)}
      />
      <Pressable
        accessibilityHint={t('nutritionistDeniedTrainingReason')}
        accessibilityLabel={t('nutritionistDeniedTrainingAction')}
        accessibilityRole="button"
        accessibilityState={{ disabled: true }}
        disabled
        onPress={() => undefined}
        style={styles.disabledAction}
      >
        <Text style={styles.disabledActionText}>{t('nutritionistDeniedTrainingAction')}</Text>
        <Text style={styles.disabledReason}>{t('nutritionistDeniedTrainingReason')}</Text>
      </Pressable>
    </View>
  );
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

function StatusText({
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
    <Text accessibilityRole={role} style={role === 'alert' ? styles.error : styles.muted}>
      {label}
    </Text>
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
      maxWidth: 640,
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
      flexShrink: 0,
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
    relationshipRow: {
      minHeight: 48,
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: theme.spacing.md,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
    },
    relationshipRowSelected: {
      borderColor: theme.colors.focus,
      borderWidth: 2,
    },
    relationshipRowPressed: {
      backgroundColor: theme.colors.pressed,
    },
    disabledAction: {
      minHeight: 52,
      justifyContent: 'center',
      gap: theme.spacing.xs,
      padding: theme.spacing.sm,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.md,
      borderWidth: 1,
      opacity: 0.74,
    },
    disabledActionText: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
    },
    disabledReason: {
      color: theme.colors.mutedForeground,
      fontSize: theme.typography.caption,
      textAlign: direction === 'rtl' ? 'right' : 'left',
      writingDirection: direction,
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
