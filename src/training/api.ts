import { createMalformedResponseError, type ApiClient } from '@/api';
import type { Cursor, IdempotencyKey, RelationshipId, WorkspaceId } from '@/contracts';

import type {
  CurrentWorkoutResponseDto,
  CurrentTraineeRelationshipResponseDto,
  ExpectedVersionBodyDto,
  PersonalRecordEventListResponseDto,
  PersonalRecordListResponseDto,
  ProgramProgressResponseDto,
  TrainingProgramListResponseDto,
  WorkoutCorrectionBodyDto,
  WorkoutDto,
  WorkoutListResponseDto,
  WorkoutPatchBodyDto,
  WorkoutResponseDto,
} from './contracts';
import {
  parseCurrentWorkout,
  parseCurrentTraineeRelationship,
  parsePersonalRecordEvents,
  parsePersonalRecords,
  parseProgramProgress,
  parseTrainingPrograms,
  parseWorkoutResponse,
  parseWorkouts,
} from './guards';

interface RelationshipRouteInput {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  signal?: AbortSignal;
}

export async function fetchCurrentTraineeRelationship(input: {
  apiClient: ApiClient;
  workspaceId: WorkspaceId;
  signal?: AbortSignal;
}) {
  const response = await input.apiClient.request<CurrentTraineeRelationshipResponseDto>({
    method: 'GET',
    path: `/workspaces/${encodeURIComponent(input.workspaceId)}/me/relationship`,
    signal: input.signal,
  });
  const parsed = parseCurrentTraineeRelationship(response, { workspaceId: input.workspaceId });
  if (parsed === undefined) {
    throw createMalformedResponseError('Current trainee relationship response was malformed.');
  }
  return parsed;
}

export async function fetchTrainingPrograms(
  input: RelationshipRouteInput & { cursor?: Cursor | null; limit?: number },
) {
  const response = await input.apiClient.request<
    TrainingProgramListResponseDto,
    { limit: number; includeArchived: boolean; cursor?: Cursor }
  >({
    method: 'GET',
    path: relationshipPath(input, 'programs'),
    query: {
      limit: input.limit ?? 10,
      includeArchived: false,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    signal: input.signal,
  });
  const parsed = parseTrainingPrograms(response, input);
  if (!parsed) throw createMalformedResponseError('Training programs response was malformed.');
  return parsed;
}

export async function fetchProgramProgress(input: RelationshipRouteInput & { programId: string }) {
  const response = await input.apiClient.request<ProgramProgressResponseDto>({
    method: 'GET',
    path: relationshipPath(input, `programs/${encodeURIComponent(input.programId)}/progress`),
    signal: input.signal,
  });
  const parsed = parseProgramProgress(response, { programId: input.programId });
  if (!parsed) throw createMalformedResponseError('Program progress response was malformed.');
  return parsed;
}

export async function fetchCurrentWorkout(input: RelationshipRouteInput): Promise<WorkoutDto | null> {
  const response = await input.apiClient.request<CurrentWorkoutResponseDto>({
    method: 'GET',
    path: relationshipPath(input, 'workouts/current'),
    signal: input.signal,
  });
  const parsed = parseCurrentWorkout(response, input);
  if (parsed === undefined) throw createMalformedResponseError('Current workout response was malformed.');
  return parsed;
}

export async function fetchWorkouts(input: RelationshipRouteInput & { cursor?: Cursor | null; limit?: number }) {
  const response = await input.apiClient.request<
    WorkoutListResponseDto,
    { limit: number; cursor?: Cursor }
  >({
    method: 'GET',
    path: relationshipPath(input, 'workouts'),
    query: {
      limit: input.limit ?? 10,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    signal: input.signal,
  });
  const parsed = parseWorkouts(response, input);
  if (!parsed) throw createMalformedResponseError('Workout list response was malformed.');
  return parsed;
}

export async function startWorkout(
  input: RelationshipRouteInput & { idempotencyKey: IdempotencyKey },
) {
  const response = await input.apiClient.request<WorkoutResponseDto>({
    method: 'POST',
    path: relationshipPath(input, 'workouts/start'),
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
  return parseWorkoutMutationResponse(response, input);
}

export async function patchWorkout(
  input: RelationshipRouteInput & {
    workoutId: string;
    body: WorkoutPatchBodyDto;
  },
) {
  const response = await input.apiClient.request<WorkoutResponseDto, undefined, WorkoutPatchBodyDto>(
    {
      method: 'PATCH',
      path: relationshipPath(input, `workouts/${encodeURIComponent(input.workoutId)}`),
      body: input.body,
      signal: input.signal,
    },
  );
  return parseWorkoutMutationResponse(response, input, input.workoutId);
}

export async function completeWorkout(
  input: RelationshipRouteInput & {
    workoutId: string;
    body: ExpectedVersionBodyDto;
    idempotencyKey: IdempotencyKey;
  },
) {
  const response = await input.apiClient.request<WorkoutResponseDto, undefined, ExpectedVersionBodyDto>(
    {
      method: 'POST',
      path: relationshipPath(input, `workouts/${encodeURIComponent(input.workoutId)}/complete`),
      body: input.body,
      idempotencyKey: input.idempotencyKey,
      signal: input.signal,
    },
  );
  return parseWorkoutMutationResponse(response, input, input.workoutId);
}

export async function correctWorkout(
  input: RelationshipRouteInput & {
    workoutId: string;
    body: WorkoutCorrectionBodyDto;
    idempotencyKey: IdempotencyKey;
  },
) {
  const response = await input.apiClient.request<
    WorkoutResponseDto,
    undefined,
    WorkoutCorrectionBodyDto
  >({
    method: 'POST',
    path: relationshipPath(input, `workouts/${encodeURIComponent(input.workoutId)}/corrections`),
    body: input.body,
    idempotencyKey: input.idempotencyKey,
    signal: input.signal,
  });
  return parseWorkoutMutationResponse(response, input, input.workoutId);
}

export async function fetchPersonalRecords(
  input: RelationshipRouteInput & { cursor?: Cursor | null; limit?: number },
) {
  const response = await input.apiClient.request<
    PersonalRecordListResponseDto,
    { limit: number; cursor?: Cursor }
  >({
    method: 'GET',
    path: relationshipPath(input, 'personal-records'),
    query: {
      limit: input.limit ?? 10,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    signal: input.signal,
  });
  const parsed = parsePersonalRecords(response);
  if (!parsed) throw createMalformedResponseError('Personal records response was malformed.');
  return parsed;
}

export async function fetchPersonalRecordEvents(
  input: RelationshipRouteInput & { cursor?: Cursor | null; limit?: number },
) {
  const response = await input.apiClient.request<
    PersonalRecordEventListResponseDto,
    { limit: number; cursor?: Cursor }
  >({
    method: 'GET',
    path: relationshipPath(input, 'personal-record-events'),
    query: {
      limit: input.limit ?? 10,
      ...(input.cursor ? { cursor: input.cursor } : {}),
    },
    signal: input.signal,
  });
  const parsed = parsePersonalRecordEvents(response);
  if (!parsed) throw createMalformedResponseError('Personal record events response was malformed.');
  return parsed;
}

function parseWorkoutMutationResponse(
  response: WorkoutResponseDto,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
  workoutId?: string,
) {
  const parsed = parseWorkoutResponse(response, { ...expected, workoutId });
  if (!parsed) throw createMalformedResponseError('Workout mutation response was malformed.');
  return parsed;
}

function relationshipPath(
  input: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
  suffix: string,
) {
  return `/workspaces/${encodeURIComponent(input.workspaceId)}/relationships/${encodeURIComponent(
    input.relationshipId,
  )}/${suffix}`;
}
