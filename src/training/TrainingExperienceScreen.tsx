import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
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
  inFlight: Map<string, Promise<unknown>>;
  sequence: number;
}

const commandKeyRegistry: CommandKeyStore = { keys: new Map(), inFlight: new Map(), sequence: 0 };
const maxCommandKeys = 100;

interface SetEditorState {
  setKey: string;
  reps: string;
  weight: string;
  completed: boolean;
  notes: string;
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
  const [setEditorOverride, setSetEditorOverride] = useState<SetEditorState | null>(null);
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
      return runIdempotentCommand(commandKeyRegistry, signature, (idempotencyKey) =>
        startWorkout({
          apiClient,
          workspaceId: context.workspace.id,
          relationshipId,
          idempotencyKey,
        }),
      );
    },
    onSuccess: invalidateTraining,
  });
  const patchMutation = useMutation({
    mutationFn: (workout: WorkoutDto) => {
      const body = firstSetPatch(workout, context, setEditor);
      if (!body) throw new Error('Set values are invalid.');
      const relationshipId = requireRelationshipId(target);
      const signature = commandSignature(
        'patch-set',
        context,
        relationshipId,
        workout.id,
        workout.version,
        commandPayloadFingerprint(body),
      );
      return runCommand(commandKeyRegistry, signature, () =>
        patchWorkout({
          apiClient,
          workspaceId: context.workspace.id,
          relationshipId,
          workoutId: workout.id,
          body,
        }),
      );
    },
    onSuccess: invalidateTraining,
  });
  const completeMutation = useMutation({
    mutationFn: async (workout: WorkoutDto) => {
      const relationshipId = requireRelationshipId(target);
      const signature = commandSignature('complete', context, relationshipId, workout.id, workout.version);
      return runIdempotentCommand(commandKeyRegistry, signature, (idempotencyKey) =>
        completeWorkout({
          apiClient,
          workspaceId: context.workspace.id,
          relationshipId,
          workoutId: workout.id,
          body: { expectedVersion: workout.version },
          idempotencyKey,
        }),
      );
    },
    onSuccess: invalidateTraining,
  });
  const correctionMutation = useMutation({
    mutationFn: async (workout: WorkoutDto) => {
      const reason = correctionReason.trim();
      if (!reason) throw new Error('A correction reason is required.');
      const relationshipId = requireRelationshipId(target);
      const body = {
        ...fullWorkoutPatch(workout, context),
        reason,
      };
      const signature = commandSignature(
        'correct',
        context,
        relationshipId,
        workout.id,
        workout.version,
        commandPayloadFingerprint(body),
      );
      return runIdempotentCommand(commandKeyRegistry, signature, (idempotencyKey) =>
        correctWorkout({
          apiClient,
          workspaceId: context.workspace.id,
          relationshipId,
          workoutId: workout.id,
          body,
          idempotencyKey,
        }),
      );
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
  const setEditor = firstIncompleteSet
    ? setEditorOverride?.setKey === firstIncompleteSet.set.setKey
      ? setEditorOverride
      : setEditorFromSet(firstIncompleteSet.set)
    : null;
  const canShowCorrection = persona === 'TRAINER' || persona === 'ASSISTANT_TRAINER';
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

              {firstIncompleteSet && setEditor ? (
                <View style={styles.editor} testID="training-set-editor">
                  <Text style={styles.sectionTitle}>{t('trainingSetEditorTitle')}</Text>
                  <TextInput
                    accessibilityLabel={t('trainingSetReps')}
                    editable={!isBusy}
                    keyboardType="number-pad"
                    onChangeText={(value) => updateSetEditor(setSetEditorOverride, setEditor, { reps: value })}
                    placeholder={t('trainingSetReps')}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={styles.input}
                    value={setEditor.reps}
                  />
                  <TextInput
                    accessibilityLabel={t('trainingSetWeight')}
                    editable={!isBusy}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => updateSetEditor(setSetEditorOverride, setEditor, { weight: value })}
                    placeholder={t('trainingSetWeight')}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={styles.input}
                    value={setEditor.weight}
                  />
                  <TextInput
                    accessibilityLabel={t('trainingSetNotes')}
                    editable={!isBusy}
                    onChangeText={(value) => updateSetEditor(setSetEditorOverride, setEditor, { notes: value })}
                    placeholder={t('trainingSetNotes')}
                    placeholderTextColor={theme.colors.mutedForeground}
                    style={styles.input}
                    value={setEditor.notes}
                  />
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: setEditor.completed, disabled: isBusy }}
                    disabled={isBusy}
                    onPress={() =>
                      updateSetEditor(setSetEditorOverride, setEditor, { completed: !setEditor.completed })
                    }
                    style={({ pressed }) => [
                      styles.checkboxRow,
                      pressed && !isBusy && styles.relationshipRowPressed,
                    ]}
                  >
                    <Text style={styles.rowLabel}>{t('trainingSetCompleted')}</Text>
                    <Text style={styles.rowValue}>
                      {setEditor.completed ? t('trainingSetCompletedYes') : t('trainingSetCompletedNo')}
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.actionRow}>
                <CommandButton
                  disabled={Boolean(currentWorkout) || isBusy}
                  direction={direction}
                  label={t('trainingStartWorkout')}
                  onPress={() => startMutation.mutate()}
                />
                <CommandButton
                  disabled={
                    !currentWorkout ||
                    currentWorkout.status !== 'IN_PROGRESS' ||
                    !firstIncompleteSet ||
                    !setEditor ||
                    !isSetEditorValid(setEditor) ||
                    isBusy
                  }
                  direction={direction}
                  label={t('trainingSaveSet')}
                  onPress={() => currentWorkout && patchMutation.mutate(currentWorkout)}
                />
                <CommandButton
                  disabled={!currentWorkout || currentWorkout.status !== 'IN_PROGRESS' || isBusy}
                  direction={direction}
                  label={t('trainingCompleteWorkout')}
                  onPress={() => currentWorkout && completeMutation.mutate(currentWorkout)}
                />
                {canShowCorrection ? (
                  <CommandButton
                    disabled={!completedWorkout || !correctionReason.trim() || isBusy}
                    direction={direction}
                    label={t('trainingSubmitCorrection')}
                    onPress={() => completedWorkout && correctionMutation.mutate(completedWorkout)}
                  />
                ) : null}
              </View>
              {canShowCorrection && completedWorkout ? (
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
  payload = 'none',
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
    payload,
  ].join(':');
}

function stableCommandKey(store: CommandKeyStore, signature: string): IdempotencyKey {
  const existing = store.keys.get(signature);
  if (existing) return existing;
  if (store.keys.size >= maxCommandKeys) {
    const oldest = store.keys.keys().next().value as string | undefined;
    if (oldest) store.keys.delete(oldest);
  }
  store.sequence += 1;
  const key = `${signature}:${store.sequence}` as IdempotencyKey;
  store.keys.set(signature, key);
  return key;
}

function retireCommandKey(store: CommandKeyStore, signature: string) {
  store.keys.delete(signature);
}

function runCommand<T>(store: CommandKeyStore, signature: string, execute: () => Promise<T>): Promise<T> {
  const current = store.inFlight.get(signature) as Promise<T> | undefined;
  if (current) return current;
  const promise = execute().finally(() => {
    store.inFlight.delete(signature);
  });
  store.inFlight.set(signature, promise);
  return promise;
}

function runIdempotentCommand<T>(
  store: CommandKeyStore,
  signature: string,
  execute: (idempotencyKey: IdempotencyKey) => Promise<T>,
): Promise<T> {
  return runCommand(store, signature, async () => {
    const idempotencyKey = stableCommandKey(store, signature);
    const result = await execute(idempotencyKey);
    retireCommandKey(store, signature);
    return result;
  });
}

function firstSetPatch(
  workout: WorkoutDto,
  context: ReadyTrainingContext,
  editor: SetEditorState | null,
): WorkoutPatchBodyDto | null {
  const first = findFirstIncompleteSet(workout);
  if (!first || !editor || editor.setKey !== first.set.setKey) return null;
  const setPatch = editorToPatchSet(editor);
  if (!setPatch) return null;
  return {
    expectedVersion: workout.version,
    exercises: [
      {
        workoutExerciseKey: first.exercise.workoutExerciseKey,
        sets: [setPatch],
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

function setEditorFromSet(set: WorkoutDto['exercises'][number]['sets'][number]): SetEditorState {
  return {
    setKey: set.setKey,
    reps: set.reps !== undefined ? String(set.reps) : '',
    weight: set.weight !== undefined ? String(set.weight) : '',
    completed: set.completed,
    notes: set.notes ?? '',
  };
}

function updateSetEditor(
  update: (value: SetEditorState | null | ((current: SetEditorState | null) => SetEditorState | null)) => void,
  fallback: SetEditorState | null,
  patch: Partial<SetEditorState>,
) {
  update((current) => {
    const base = current?.setKey === fallback?.setKey ? current : fallback;
    return base ? { ...base, ...patch } : base;
  });
}

function editorToPatchSet(editor: SetEditorState) {
  const reps = optionalInteger(editor.reps);
  const weight = optionalNumber(editor.weight);
  if (reps === null || weight === null) return null;
  return {
    setKey: editor.setKey,
    ...(weight !== undefined ? { weight } : {}),
    ...(reps !== undefined ? { reps } : {}),
    completed: editor.completed,
    ...(editor.notes.trim() ? { notes: editor.notes.trim() } : {}),
  };
}

function isSetEditorValid(editor: SetEditorState) {
  return optionalInteger(editor.reps) !== null && optionalNumber(editor.weight) !== null;
}

function optionalInteger(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

function optionalNumber(value: string): number | undefined | null {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function commandPayloadFingerprint(value: unknown): string {
  return JSON.stringify(sortForFingerprint(value));
}

function sortForFingerprint(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortForFingerprint);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortForFingerprint(entry)]),
  );
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
    editor: {
      gap: theme.spacing.sm,
    },
    checkboxRow: {
      alignItems: 'center',
      borderColor: theme.colors.border,
      borderRadius: theme.radius.sm,
      borderWidth: 1,
      flexDirection: direction === 'rtl' ? 'row-reverse' : 'row',
      justifyContent: 'space-between',
      minHeight: 44,
      padding: theme.spacing.sm,
    },
    sectionTitle: {
      color: theme.colors.foreground,
      fontSize: theme.typography.body,
      fontWeight: '700',
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
