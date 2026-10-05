import {
  hasExplicitTimezoneOffset,
  type RelationshipId,
  type WorkspaceId,
} from '@/contracts';

import type {
  CurrentTraineeRelationshipResponseDto,
  CurrentWorkoutResponseDto,
  PersonalRecordDto,
  PersonalRecordEventDto,
  PersonalRecordEventListResponseDto,
  PersonalRecordListResponseDto,
  ProgramProgressResponseDto,
  TrainingPageMetaDto,
  TrainingProgramDto,
  TrainingProgramListResponseDto,
  TrainingProgramResponseDto,
  WorkoutDto,
  WorkoutListResponseDto,
  WorkoutResponseDto,
} from './contracts';

const programStatuses = ['DRAFT', 'ACTIVE', 'REPLACED', 'COMPLETED', 'ARCHIVED'] as const;
const workoutStatuses = ['IN_PROGRESS', 'COMPLETED', 'ABANDONED'] as const;
const recordTypes = ['MAX_WEIGHT', 'REP_AT_WEIGHT', 'ESTIMATED_1RM'] as const;
const recordEventTypes = ['ACHIEVED', 'ADJUSTED', 'RETRACTED'] as const;

export function parseCurrentTraineeRelationship(
  value: unknown,
  expected: { workspaceId: WorkspaceId },
): CurrentTraineeRelationshipResponseDto['data']['relationship'] | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = (value as CurrentTraineeRelationshipResponseDto).data;
  if (!data || typeof data !== 'object' || !('relationship' in data)) return undefined;
  if (data.relationship === null) return null;
  const relationship = data.relationship;
  if (!relationship || typeof relationship !== 'object') return undefined;
  const candidate =
    relationship as CurrentTraineeRelationshipResponseDto['data']['relationship'];
  if (!candidate) return undefined;
  if (!nonEmptyString(candidate.id)) return undefined;
  if (candidate.workspaceId !== expected.workspaceId) return undefined;
  if (candidate.status !== 'ACTIVE') return undefined;
  if (!nonNegativeInteger(candidate.version)) return undefined;
  return candidate;
}

export function parseTrainingPrograms(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): TrainingProgramListResponseDto | null {
  return parsePage(value, (item) => parseProgram(item, expected));
}

export function parseTrainingProgram(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): TrainingProgramDto | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as TrainingProgramResponseDto).data;
  return parseProgram(data, expected);
}

export function parseProgramProgress(
  value: unknown,
  expected: { programId: string },
): ProgramProgressResponseDto['data']['progress'] | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as ProgramProgressResponseDto).data;
  if (!data || typeof data !== 'object') return null;
  const progress = (data as { progress?: unknown }).progress;
  if (!progress || typeof progress !== 'object') return null;
  const candidate = progress as ProgramProgressResponseDto['data']['progress'];
  if (candidate.programId !== expected.programId) return null;
  if (!nonEmptyString(candidate.programRevisionId)) return null;
  if (!nonNegativeInteger(candidate.currentDaySequence)) return null;
  if (!nonNegativeInteger(candidate.completedDayCount)) return null;
  if (!nonNegativeInteger(candidate.skippedDayCount)) return null;
  if (!nonNegativeInteger(candidate.version)) return null;
  return candidate;
}

export function parseCurrentWorkout(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): WorkoutDto | null | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = (value as CurrentWorkoutResponseDto).data;
  if (!data || typeof data !== 'object' || !('workout' in data)) return undefined;
  if (data.workout === null) return null;
  return parseWorkout(data.workout, expected) ?? undefined;
}

export function parseWorkoutResponse(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId; workoutId?: string },
): WorkoutDto | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as WorkoutResponseDto).data;
  if (!data || typeof data !== 'object') return null;
  const workout = (data as { workout?: unknown }).workout;
  const parsed = parseWorkout(workout, expected);
  if (!parsed) return null;
  if (expected.workoutId && parsed.id !== expected.workoutId) return null;
  return parsed;
}

export function parseWorkouts(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): WorkoutListResponseDto | null {
  return parsePage(value, (item) => parseWorkout(item, expected));
}

export function parsePersonalRecords(value: unknown): PersonalRecordListResponseDto | null {
  return parsePage(value, parsePersonalRecord);
}

export function parsePersonalRecordEvents(
  value: unknown,
): PersonalRecordEventListResponseDto | null {
  return parsePage(value, parsePersonalRecordEvent);
}

function parsePage<T>(
  value: unknown,
  parseItem: (value: unknown) => T | null,
): { data: T[]; meta?: TrainingPageMetaDto } | null {
  if (!value || typeof value !== 'object') return null;
  const data = (value as { data?: unknown }).data;
  const meta = (value as { meta?: unknown }).meta;
  if (!Array.isArray(data)) return null;
  if (meta !== undefined && !parseMeta(meta)) return null;
  const rows: T[] = [];
  for (const item of data) {
    const parsed = parseItem(item);
    if (!parsed) return null;
    rows.push(parsed);
  }
  return {
    data: rows,
    ...(meta !== undefined ? { meta: meta as TrainingPageMetaDto } : {}),
  };
}

function parseMeta(value: unknown): value is TrainingPageMetaDto {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { nextCursor?: unknown; hasMore?: unknown };
  if (
    candidate.nextCursor !== undefined &&
    candidate.nextCursor !== null &&
    !nonEmptyString(candidate.nextCursor)
  ) {
    return false;
  }
  if (candidate.hasMore !== undefined && typeof candidate.hasMore !== 'boolean') return false;
  return true;
}

function parseProgram(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): TrainingProgramDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as TrainingProgramDto;
  if (!nonEmptyString(candidate.id)) return null;
  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!nonEmptyString(candidate.name)) return null;
  if (!programStatuses.includes(candidate.status)) return null;
  if (!nonEmptyString(candidate.currentRevisionId)) return null;
  if (!nonNegativeInteger(candidate.version)) return null;
  if (candidate.startedAt !== undefined && !hasExplicitTimezoneOffset(candidate.startedAt)) {
    return null;
  }
  if (candidate.endedAt !== undefined && !hasExplicitTimezoneOffset(candidate.endedAt)) {
    return null;
  }
  return candidate;
}

function parseWorkout(
  value: unknown,
  expected: { workspaceId: WorkspaceId; relationshipId: RelationshipId },
): WorkoutDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as WorkoutDto;
  if (!nonEmptyString(candidate.id)) return null;
  if (candidate.workspaceId !== expected.workspaceId) return null;
  if (candidate.relationshipId !== expected.relationshipId) return null;
  if (!nonEmptyString(candidate.traineeUserId)) return null;
  if (!nonEmptyString(candidate.programId)) return null;
  if (!nonEmptyString(candidate.programRevisionId)) return null;
  if (!nonEmptyString(candidate.dayKey)) return null;
  if (!nonNegativeInteger(candidate.daySequence)) return null;
  if (!nonEmptyString(candidate.performedByUserId)) return null;
  if (!workoutStatuses.includes(candidate.status)) return null;
  if (!hasExplicitTimezoneOffset(candidate.startedAt)) return null;
  if (candidate.completedAt !== undefined && !hasExplicitTimezoneOffset(candidate.completedAt)) {
    return null;
  }
  if (
    candidate.traineeEditableUntil !== undefined &&
    !hasExplicitTimezoneOffset(candidate.traineeEditableUntil)
  ) {
    return null;
  }
  if (candidate.abandonedAt !== undefined && !hasExplicitTimezoneOffset(candidate.abandonedAt)) {
    return null;
  }
  if (!Array.isArray(candidate.exercises)) return null;
  if (!candidate.exercises.every(parseWorkoutExercise)) return null;
  if (!nonNegativeInteger(candidate.version)) return null;
  return candidate;
}

function parseWorkoutExercise(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as WorkoutDto['exercises'][number];
  if (!nonEmptyString(candidate.workoutExerciseKey)) return false;
  if (!nonEmptyString(candidate.prescriptionId)) return false;
  if (!nonEmptyString(candidate.exerciseId)) return false;
  if (!nonEmptyString(candidate.exerciseNameSnapshot)) return false;
  if (!nonNegativeInteger(candidate.order)) return false;
  if (!nonEmptyString(candidate.setStructure)) return false;
  if (!nonNegativeInteger(candidate.targetSets)) return false;
  if (!Array.isArray(candidate.sets)) return false;
  return candidate.sets.every(parseWorkoutSet);
}

function parseWorkoutSet(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as WorkoutDto['exercises'][number]['sets'][number];
  if (!nonEmptyString(candidate.setKey)) return false;
  if (!nonNegativeInteger(candidate.setIndex)) return false;
  if (!nonEmptyString(candidate.setType)) return false;
  if (typeof candidate.completed !== 'boolean') return false;
  return true;
}

function parsePersonalRecord(value: unknown): PersonalRecordDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as PersonalRecordDto;
  if (!nonEmptyString(candidate.id)) return null;
  if (!nonEmptyString(candidate.exerciseId)) return null;
  if (!recordTypes.includes(candidate.recordType)) return null;
  if (typeof candidate.qualifierKey !== 'string') return null;
  if (typeof candidate.value !== 'number') return null;
  if (!nonEmptyString(candidate.sourceWorkoutId)) return null;
  if (!nonNegativeInteger(candidate.sourceWorkoutVersion)) return null;
  return candidate;
}

function parsePersonalRecordEvent(value: unknown): PersonalRecordEventDto | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as PersonalRecordEventDto;
  if (!nonEmptyString(candidate.id)) return null;
  if (!nonEmptyString(candidate.exerciseId)) return null;
  if (!recordTypes.includes(candidate.recordType)) return null;
  if (!recordEventTypes.includes(candidate.eventType)) return null;
  if (typeof candidate.qualifierKey !== 'string') return null;
  if (!nonEmptyString(candidate.sourceWorkoutId)) return null;
  if (!nonNegativeInteger(candidate.sourceWorkoutVersion)) return null;
  if (!hasExplicitTimezoneOffset(candidate.occurredAt)) return null;
  return candidate;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}
