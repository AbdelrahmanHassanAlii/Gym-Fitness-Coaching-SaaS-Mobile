import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiClient } from '@/api';
import type { IdempotencyKey, RelationshipId } from '@/contracts';
import type { TextDirection } from '@/i18n/locales';
import type { TranslationKey } from '@/i18n/messages';
import { protectedQueryScope } from '@/query';
import { fetchStaffRelationships, type StaffWorkspaceResolution } from '@/trainerAssistant';
import type { StaffRelationshipSummaryDto } from '@/trainerAssistant/contracts';
import { useTheme, type ThemeTokens } from '@/theme';

import {
  completeWorkout,
  correctWorkout,
  fetchCurrentTraineeRelationship,
  fetchCurrentWorkout,
  fetchPersonalRecordEvents,
  fetchPersonalRecords,
  fetchProgramProgress,
  fetchTrainingPrograms,
  fetchWorkouts,
  patchWorkout,
  startWorkout,
} from './api';
import type { WorkoutDto, WorkoutPatchBodyDto } from './contracts';

type ReadyTrainingContext = Extract<StaffWorkspaceResolution, { status: 'ready' }>;

interface CommandKeyStore {
  keys: Map<string, IdempotencyKey>;
  sequence: number;
}

interface TrainingExperienceScreenProps {
  apiClient: ApiClient;
  context: ReadyTrainingContext;
  direction: TextDirection;
  t: (key: TranslationKey) => string;
}

export function TrainingExperienceScreen({
  apiClient,
  context,
  direction,
  t,
}: TrainingExperienceScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  const queryClient = useQueryClient();
  const persona = context.workspaceContext.preferredPersona;
  const [selectedRelationshipId, setSelectedRelationshipId] = useState<RelationshipId | null>(null);
  const [correctionReason, setCorrectionReason] = useState('');
  const commandKeys = useRef<CommandKeyStore>({ keys: new Map(), sequence: 0 });
  const traineeRelationshipQuery = useQuery({
    enabled: persona === 'TRAINEE',
    queryKey: traineeRelationshipKey(context),
    queryFn: ({ signal }) =>
      fetchCurrentTraineeRelationship({
        apiClient,
        workspaceId: context.workspace.id,
        signal,
      }),
  });
  const relationshipsQuery = useQuery({
    enabled: persona === 'TRAINER' || persona === 'ASSISTANT_TRAINER',
    queryKey: trainingRelationshipDiscoveryKey(context),
    queryFn: ({ signal }) =>
      fetchStaffRelationships({
        apiClient,
        workspaceId: context.workspace.id,
        signal,
      }),
  });
  const relationships = useMemo(() => relationshipsQuery.data ?? [], [relationshipsQuery.data]);
  const selectedRelationship = useMemo(
    () => relationshipById(relationships, selectedRelationshipId),
    [relationships, selectedRelationshipId],
  );
  const traineeRelationship = persona === 'TRAINEE' ? (traineeRelationshipQuery.data ?? null) : null;
  const target = persona === 'TRAINEE' ? (traineeRelationship?.id ?? null) : (selectedRelationship?.id ?? null);
  const enabled = Boolean(target);

  const programsQuery = useQuery({
    enabled,
    queryKey: trainingProgramsKey(context, target),
    queryFn: ({ signal }) =>
      fetchTrainingPrograms({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        signal,
      }),
  });
  const activeProgram =
    programsQuery.data?.data.find((program) => program.status === 'ACTIVE') ??
    programsQuery.data?.data[0] ??
    null;
  const progressQuery = useQuery({
    enabled: Boolean(target && activeProgram),
    queryKey: trainingProgramProgressKey(context, target, activeProgram?.id),
    queryFn: ({ signal }) =>
      fetchProgramProgress({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        programId: activeProgram?.id ?? '',
        signal,
      }),
  });
  const currentWorkoutQuery = useQuery({
    enabled,
    queryKey: currentWorkoutKey(context, target),
    queryFn: ({ signal }) =>
      fetchCurrentWorkout({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        signal,
      }),
  });
  const workoutsQuery = useQuery({
    enabled,
    queryKey: workoutsKey(context, target),
    queryFn: ({ signal }) =>
      fetchWorkouts({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        signal,
      }),
  });
  const recordsQuery = useQuery({
    enabled,
    queryKey: personalRecordsKey(context, target),
    queryFn: ({ signal }) =>
      fetchPersonalRecords({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        signal,
      }),
  });
  const recordEventsQuery = useQuery({
    enabled,
    queryKey: personalRecordEventsKey(context, target),
    queryFn: ({ signal }) =>
      fetchPersonalRecordEvents({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: target as RelationshipId,
        signal,
      }),
  });

  const invalidateTraining = () => {
    void queryClient.invalidateQueries({
      queryKey: trainingContextKeyPrefix(context, target),
    });
  };

  const startMutation = useMutation({
    mutationFn: async () => {
      const relationshipId = requireRelationshipId(target);
      const signature = commandSignature('start', context, relationshipId);
      const idempotencyKey = stableCommandKey(commandKeys.current, signature);
      const result = await startWorkout({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId,
        idempotencyKey,
      });
      retireCommandKey(commandKeys.current, signature);
      return result;
    },
    onSuccess: invalidateTraining,
  });
  const patchMutation = useMutation({
    mutationFn: (workout: WorkoutDto) =>
      patchWorkout({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId: requireRelationshipId(target),
        workoutId: workout.id,
        body: firstSetPatch(workout, context),
      }),
    onSuccess: invalidateTraining,
  });
  const completeMutation = useMutation({
    mutationFn: async (workout: WorkoutDto) => {
      const relationshipId = requireRelationshipId(target);
      const signature = commandSignature('complete', context, relationshipId, workout.id, workout.version);
      const idempotencyKey = stableCommandKey(commandKeys.current, signature);
      const result = await completeWorkout({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId,
        workoutId: workout.id,
        body: { expectedVersion: workout.version },
        idempotencyKey,
      });
      retireCommandKey(commandKeys.current, signature);
      return result;
    },
    onSuccess: invalidateTraining,
  });
  const correctionMutation = useMutation({
    mutationFn: async (workout: WorkoutDto) => {
      const reason = correctionReason.trim();
      if (!reason) throw new Error('A correction reason is required.');
      const relationshipId = requireRelationshipId(target);
      const signature = commandSignature('correct', context, relationshipId, workout.id, workout.version);
      const idempotencyKey = stableCommandKey(commandKeys.current, signature);
      const result = await correctWorkout({
        apiClient,
        workspaceId: context.workspace.id,
        relationshipId,
        workoutId: workout.id,
        body: {
          ...fullWorkoutPatch(workout, context),
          reason,
        },
        idempotencyKey,
      });
      retireCommandKey(commandKeys.current, signature);
      return result;
    },
    onSuccess: () => {
      setCorrectionReason('');
      invalidateTraining();
    },
  });

  const currentWorkout = currentWorkoutQuery.data ?? null;
  const completedWorkout =
    workoutsQuery.data?.data.find((workout) => workout.status === 'COMPLETED') ?? null;
  const firstIncompleteSet = currentWorkout ? findFirstIncompleteSet(currentWorkout) : null;
  const isBusy =
    startMutation.isPending ||
    patchMutation.isPending ||
    completeMutation.isPending ||
    correctionMutation.isPending;

  return (
    <View style={styles.screen} testID="training-experience-screen">
      <Text accessibilityRole="header" style={styles.title}>
        {t('trainingTitle')}
      </Text>
      <View style={styles.section}>
        <SummaryRow direction={direction} label={t('trainerWorkspace')} value={context.workspace.name} />
        <SummaryRow direction={direction} label={t('trainerMembership')} value={context.membership.status} />
        <SummaryRow direction={direction} label={t('trainerPersona')} value={persona ?? t('traineeNone')} />
      </View>

      {persona === 'TRAINEE' && traineeRelationshipQuery.isLoading ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('trainingRelationshipLoading')}
        </Text>
      ) : persona === 'TRAINEE' && traineeRelationshipQuery.isError ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t('trainingRelationshipUnavailable')}
        </Text>
      ) : persona === 'TRAINEE' && traineeRelationshipQuery.data === null ? (
        <Text accessibilityRole="summary" style={styles.muted} testID="training-trainee-no-relationship">
          {t('trainingTraineeRelationshipUnavailable')}
        </Text>
      ) : persona === 'TRAINEE' ? null : relationshipsQuery.isLoading ? (
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
      ) : (
        <View style={styles.section} testID="training-relationship-list">
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

      {persona !== 'TRAINEE' && !selectedRelationship ? (
        <Text accessibilityRole="summary" style={styles.muted}>
          {t('trainingRelationshipSelectPrompt')}
        </Text>
      ) : null}

      {target ? (
        <View style={styles.section} testID="training-relationship-detail">
          {isTrainingUnavailable(
            programsQuery.isError,
            progressQuery.isError,
            currentWorkoutQuery.isError,
            workoutsQuery.isError,
            recordsQuery.isError,
            recordEventsQuery.isError,
          ) ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {t('trainingUnavailable')}
            </Text>
            ) : isTrainingLoading(
              programsQuery.isLoading,
              progressQuery.isLoading,
              currentWorkoutQuery.isLoading,
              workoutsQuery.isLoading,
              recordsQuery.isLoading,
              recordEventsQuery.isLoading,
            ) ? (
            <Text accessibilityRole="summary" style={styles.muted}>
              {t('trainingLoading')}
            </Text>
          ) : (
            <>
              <SummaryRow
                direction={direction}
                label={t('trainingProgramsShown')}
                value={String(programsQuery.data?.data.length ?? 0)}
              />
              {programsQuery.data?.meta?.nextCursor ? (
                <Text style={styles.muted}>{t('trainingProgramPreviewLimited')}</Text>
              ) : null}
              <SummaryRow
                direction={direction}
                label={t('trainingActiveProgram')}
                value={activeProgram?.name ?? t('traineeNone')}
              />
              {progressQuery.data ? (
                <SummaryRow
                  direction={direction}
                  label={t('trainingCurrentDay')}
                  value={String(progressQuery.data.currentDaySequence)}
                />
              ) : null}
              <SummaryRow
                direction={direction}
                label={t('trainingCurrentWorkout')}
                value={currentWorkout?.status ?? t('traineeNone')}
              />
              <SummaryRow
                direction={direction}
                label={t('trainingRecentWorkouts')}
                value={String(workoutsQuery.data?.data.length ?? 0)}
              />
              {workoutsQuery.data?.meta?.nextCursor ? (
                <Text style={styles.muted}>{t('trainingWorkoutPreviewLimited')}</Text>
              ) : null}
              <SummaryRow
                direction={direction}
                label={t('trainingPersonalRecords')}
                value={String(recordsQuery.data?.data.length ?? 0)}
              />
              {recordsQuery.data?.meta?.nextCursor ? (
                <Text style={styles.muted}>{t('trainingRecordPreviewLimited')}</Text>
              ) : null}
              <SummaryRow
                direction={direction}
                label={t('trainingPersonalRecordEvents')}
                value={String(recordEventsQuery.data?.data.length ?? 0)}
              />

              <View style={styles.actionRow}>
                <CommandButton
                  disabled={Boolean(currentWorkout) || isBusy}
                  direction={direction}
                  label={t('trainingStartWorkout')}
                  onPress={() => startMutation.mutate()}
                />
                <CommandButton
                  disabled={!currentWorkout || currentWorkout.status !== 'IN_PROGRESS' || !firstIncompleteSet || isBusy}
                  direction={direction}
                  label={t('trainingSaveFirstSet')}
                  onPress={() => currentWorkout && patchMutation.mutate(currentWorkout)}
                />
                <CommandButton
                  disabled={!currentWorkout || currentWorkout.status !== 'IN_PROGRESS' || isBusy}
                  direction={direction}
                  label={t('trainingCompleteWorkout')}
                  onPress={() => currentWorkout && completeMutation.mutate(currentWorkout)}
                />
                <CommandButton
                  disabled={!completedWorkout || !correctionReason.trim() || isBusy}
                  direction={direction}
                  label={t('trainingSubmitCorrection')}
                  onPress={() => completedWorkout && correctionMutation.mutate(completedWorkout)}
                />
              </View>
              {completedWorkout ? (
                <TextInput
                  accessibilityLabel={t('trainingCorrectionReason')}
                  editable={!isBusy}
                  onChangeText={setCorrectionReason}
                  placeholder={t('trainingCorrectionReason')}
                  placeholderTextColor={theme.colors.mutedForeground}
                  style={styles.input}
                  value={correctionReason}
                />
              ) : null}
              {isBusy ? <Text style={styles.muted}>{t('trainingCommandPending')}</Text> : null}
              {mutationHasError(startMutation, patchMutation, completeMutation, correctionMutation) ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  {t('trainingCommandUnavailable')}
                </Text>
              ) : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function trainingRelationshipDiscoveryKey(context: ReadyTrainingContext): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'training',
    'relationship-discovery',
    context.workspace.id,
    context.membership.id,
    context.workspaceContext.preferredPersona,
  ] as const;
}

export function traineeRelationshipKey(context: ReadyTrainingContext): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'training',
    'trainee-relationship',
    context.workspace.id,
    context.membership.id,
    context.workspaceContext.preferredPersona,
  ] as const;
}

export function trainingProgramsKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [...trainingContextKeyPrefix(context, relationshipId), 'programs', { limit: 10 }] as const;
}

export function trainingProgramProgressKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
  programId?: string | null,
): readonly unknown[] {
  return [...trainingContextKeyPrefix(context, relationshipId), 'program-progress', programId ?? null] as const;
}

export function currentWorkoutKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [...trainingContextKeyPrefix(context, relationshipId), 'current-workout'] as const;
}

export function workoutsKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [...trainingContextKeyPrefix(context, relationshipId), 'workouts', { limit: 10 }] as const;
}

export function personalRecordsKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [...trainingContextKeyPrefix(context, relationshipId), 'personal-records', { limit: 10 }] as const;
}

export function personalRecordEventsKey(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    ...trainingContextKeyPrefix(context, relationshipId),
    'personal-record-events',
    { limit: 10 },
  ] as const;
}

function trainingContextKeyPrefix(
  context: ReadyTrainingContext,
  relationshipId?: RelationshipId | null,
): readonly unknown[] {
  return [
    protectedQueryScope,
    context.workspaceContext.generation,
    'training',
    context.workspace.id,
    context.membership.id,
    context.workspaceContext.preferredPersona,
    relationshipId ?? null,
  ] as const;
}

function relationshipById(
  relationships: StaffRelationshipSummaryDto[],
  relationshipId: RelationshipId | null,
) {
  if (!relationshipId) return null;
  return relationships.find((relationship) => relationship.id === relationshipId) ?? null;
}

function requireRelationshipId(value: RelationshipId | null): RelationshipId {
  if (!value) throw new Error('Training relationship context is required.');
  return value;
}

function commandSignature(
  action: string,
  context: ReadyTrainingContext,
  relationshipId: RelationshipId,
  resourceId = 'none',
  version = 0,
): string {
  return [
    'mob015',
    action,
    context.workspaceContext.generation,
    context.workspace.id,
    context.membership.id,
    context.workspaceContext.preferredPersona,
    relationshipId,
    resourceId,
    String(version),
  ].join(':');
}

function stableCommandKey(store: CommandKeyStore, signature: string): IdempotencyKey {
  const existing = store.keys.get(signature);
  if (existing) return existing;
  store.sequence += 1;
  const key = `${signature}:${store.sequence}` as IdempotencyKey;
  store.keys.set(signature, key);
  return key;
}

function retireCommandKey(store: CommandKeyStore, signature: string) {
  store.keys.delete(signature);
}

function firstSetPatch(workout: WorkoutDto, context: ReadyTrainingContext): WorkoutPatchBodyDto {
  const first = findFirstIncompleteSet(workout);
  if (!first) return fullWorkoutPatch(workout, context);
  return {
    expectedVersion: workout.version,
    exercises: [
      {
        workoutExerciseKey: first.exercise.workoutExerciseKey,
        sets: [toPatchSet(first.set)],
      },
    ],
    clientMutationId: clientMutationId('patch-first-set', context, workout),
  };
}

function fullWorkoutPatch(workout: WorkoutDto, context: ReadyTrainingContext): WorkoutPatchBodyDto {
  return {
    expectedVersion: workout.version,
    exercises: workout.exercises.map((exercise) => ({
      workoutExerciseKey: exercise.workoutExerciseKey,
      sets: exercise.sets.map(toPatchSet),
    })),
    ...(workout.notes ? { notes: workout.notes } : {}),
    clientMutationId: clientMutationId('full-patch', context, workout),
  };
}

function clientMutationId(
  action: string,
  context: ReadyTrainingContext,
  workout: WorkoutDto,
): string {
  return [
    'mob015',
    action,
    context.workspaceContext.generation,
    context.workspace.id,
    workout.relationshipId,
    workout.id,
    String(workout.version),
  ].join(':');
}

function findFirstIncompleteSet(workout: WorkoutDto) {
  for (const exercise of workout.exercises) {
    const set = exercise.sets.find((candidate) => !candidate.completed);
    if (set) return { exercise, set };
  }
  return null;
}

function toPatchSet(set: WorkoutDto['exercises'][number]['sets'][number]) {
  return {
    setKey: set.setKey,
    ...(set.weight !== undefined ? { weight: set.weight } : {}),
    ...(set.reps !== undefined ? { reps: set.reps } : {}),
    ...(set.durationSeconds !== undefined ? { durationSeconds: set.durationSeconds } : {}),
    ...(set.distance !== undefined ? { distance: set.distance } : {}),
    ...(set.rpe !== undefined ? { rpe: set.rpe } : {}),
    ...(set.rir !== undefined ? { rir: set.rir } : {}),
    completed: set.completed,
    ...(set.notes !== undefined ? { notes: set.notes } : {}),
  };
}

function isTrainingLoading(...states: boolean[]) {
  return states.some(Boolean);
}

function isTrainingUnavailable(...states: boolean[]) {
  return states.some(Boolean);
}

function mutationHasError(...mutations: { isError: boolean }[]) {
  return mutations.some((mutation) => mutation.isError);
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

function CommandButton({
  disabled,
  direction,
  label,
  onPress,
}: {
  disabled: boolean;
  direction: TextDirection;
  label: string;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  const styles = createStyles(theme, direction);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.commandButton,
        disabled && styles.commandButtonDisabled,
        pressed && !disabled && styles.relationshipRowPressed,
      ]}
    >
      <Text style={styles.commandButtonText}>{label}</Text>
    </Pressable>
  );
}

function createStyles(theme: ThemeTokens, direction: TextDirection) {
  return StyleSheet.create({
    screen: {
      width: '100%',
      maxWidth: 680,
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
    actionRow: {
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      flexWrap: 'wrap',
      gap: theme.spacing.sm,
    },
    commandButton: {
      minHeight: 44,
      justifyContent: 'center',
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      backgroundColor: theme.colors.primary,
      borderRadius: theme.radius.sm,
    },
    commandButtonDisabled: {
      backgroundColor: theme.colors.disabled,
    },
    commandButtonText: {
      color: theme.colors.primaryForeground,
      fontSize: theme.typography.body,
      fontWeight: '700',
      writingDirection: direction,
    },
    input: {
      minHeight: 44,
      paddingHorizontal: theme.spacing.md,
      paddingVertical: theme.spacing.sm,
      color: theme.colors.foreground,
      backgroundColor: theme.colors.surfaceRaised,
      borderColor: theme.colors.border,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      fontSize: theme.typography.body,
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
