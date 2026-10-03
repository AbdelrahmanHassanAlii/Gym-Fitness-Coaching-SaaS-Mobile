import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ApiClient } from '@/api';
import type { RelationshipId } from '@/contracts';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { protectedQueryScope } from '@/query';
import { useTheme, type ThemeTokens } from '@/theme';

import { fetchStaffRelationshipDashboard, fetchStaffRelationships } from './api';
import type { StaffWorkspaceResolution } from './guards';

type ReadyStaffContext = Extract<StaffWorkspaceResolution, { status: 'ready' }>;
type StaffRouteKind = 'home' | 'relationships';

interface StaffExperienceScreenProps {
  apiClient: ApiClient;
  context: ReadyStaffContext;
  direction: TextDirection;
  routeKind: StaffRouteKind;
  t: (key: TranslationKey) => string;
}

export function StaffExperienceScreen({
  apiClient,
  context,
  direction,
  routeKind,
  t,
}: StaffExperienceScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const persona = context.workspaceContext.preferredPersona;
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<RelationshipId | null>(null);
  const relationshipsQuery = useQuery({
    queryKey: staffRelationshipsKey(context),
    queryFn: ({ signal }) =>
      fetchStaffRelationships({
        apiClient,
        workspaceId: context.workspace.id,
        signal,
      }),
  });
  const relationships = useMemo(() => relationshipsQuery.data ?? [], [relationshipsQuery.data]);
  const selectedRelationship = useMemo(
    () =>
      selectedRelationshipId
        ? relationships.find((relationship) => relationship.id === selectedRelationshipId) ?? null
        : null,
    [relationships, selectedRelationshipId],
  );
  const dashboardQuery = useQuery({
    enabled: Boolean(selectedRelationship && persona),
    queryKey: staffRelationshipDashboardKey(context, selectedRelationship?.id),
    queryFn: ({ signal }) =>
      fetchStaffRelationshipDashboard({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: selectedRelationship?.id as RelationshipId,
        persona: persona as 'TRAINER' | 'ASSISTANT_TRAINER',
        signal,
      }),
  });
  const dashboard = dashboardQuery.data;

  return (
    <View style={styles.screen} testID={`staff-${routeKind}-screen`}>
      <Text accessibilityRole="header" style={styles.title}>
        {persona === 'ASSISTANT_TRAINER' ? t('assistantHomeTitle') : t('trainerHomeTitle')}
      </Text>
      <Text style={styles.subtitle}>{context.workspace.name}</Text>

      <View style={styles.section}>
        <SummaryRow direction={direction} label={t('trainerWorkspace')} value={context.workspace.name} />
        <SummaryRow direction={direction} label={t('trainerMembership')} value={context.membership.status} />
        <SummaryRow direction={direction} label={t('trainerPersona')} value={persona ?? t('traineeNone')} />
      </View>

      {relationshipsQuery.isLoading ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('trainerRelationshipsLoading')}
        </Text>
      ) : relationshipsQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('trainerRelationshipsUnavailable')}
        </Text>
      ) : relationships.length === 0 ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('trainerRelationshipsEmpty')}
        </Text>
      ) : routeKind === 'home' ? (
        <View style={styles.section} testID="staff-home-summary">
          <SummaryRow
            direction={direction}
            label={t('trainerVisibleRelationships')}
            value={String(relationships.length)}
          />
          <SummaryRow
            direction={direction}
            label={t('trainerFirstRelationshipStatus')}
            value={relationships[0]?.status ?? t('traineeNone')}
          />
        </View>
      ) : (
        <View style={styles.section} testID="staff-relationship-list">
          {relationships.map((relationship) => (
            <Pressable
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
          <Text accessibilityRole="summary" style={styles.muted}>
            {t('trainerRelationshipSelectPrompt')}
          </Text>
        ) : dashboardQuery.isLoading ? (
          <Text accessibilityRole="summary" style={styles.muted}>
            {t('trainerDashboardLoading')}
          </Text>
        ) : dashboardQuery.isError ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {t('trainerDashboardUnavailable')}
          </Text>
        ) : dashboard ? (
          <View style={styles.section} testID="staff-dashboard-summary">
            <SummaryRow
              direction={direction}
              label={t('trainerRelationshipStatus')}
              value={dashboard.relationship.status}
            />
            <SummaryRow
              direction={direction}
              label={t('trainerVisibleSections')}
              value={visibleSections(dashboard.access.sections).join(', ') || t('traineeNone')}
            />
            {typeof dashboard.training?.summary?.completedSessions === 'number' ? (
              <SummaryRow
                direction={direction}
                label={t('traineeCompletedSessions')}
                value={String(dashboard.training.summary.completedSessions)}
              />
            ) : null}
          </View>
        ) : null
      ) : null}
    </View>
  );
}

export function staffRelationshipsKey(context: ReadyStaffContext): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'staff',
    'relationships',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
    },
  ] as const;
}

export function staffRelationshipDashboardKey(
  context: ReadyStaffContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'staff',
    'relationship-dashboard',
    {
      workspaceId: context.workspace.id,
      membershipId: context.membership.id,
      persona: context.workspaceContext.preferredPersona,
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
