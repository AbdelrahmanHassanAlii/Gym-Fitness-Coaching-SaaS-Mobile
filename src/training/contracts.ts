import type {
  ApiTimestamp,
  Cursor,
  RelationshipId,
  UserId,
  WorkspaceId,
} from '@/contracts';

export type TrainingProgramStatus = 'DRAFT' | 'ACTIVE' | 'REPLACED' | 'COMPLETED' | 'ARCHIVED';
export type TrainingProgramDayType = 'RESISTANCE' | 'CARDIO' | 'RECOVERY' | 'REST' | 'CUSTOM';
export type WorkoutStatus = 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
export type PersonalRecordType = 'MAX_WEIGHT' | 'REP_AT_WEIGHT' | 'ESTIMATED_1RM';
export type PersonalRecordEventType = 'ACHIEVED' | 'ADJUSTED' | 'RETRACTED';

export interface TraineeTrainingRelationshipDto {
  id: RelationshipId;
  workspaceId: WorkspaceId;
  status: 'ACTIVE';
  version: number;
}

export interface CurrentTraineeRelationshipResponseDto {
  data: { relationship: TraineeTrainingRelationshipDto | null };
}

export interface TrainingPageMetaDto {
  nextCursor?: Cursor | null;
  hasMore?: boolean;
}

export interface TrainingPageDto<TItem> {
  data: TItem[];
  meta?: TrainingPageMetaDto;
}

export interface TrainingProgramDto {
  id: string;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  name: string;
  status: TrainingProgramStatus;
  startedAt?: ApiTimestamp;
  endedAt?: ApiTimestamp;
  currentRevisionId: string;
  version: number;
}

export interface TrainingProgramResponseDto {
  data: TrainingProgramDto;
}

export type TrainingProgramListResponseDto = TrainingPageDto<TrainingProgramDto>;

export interface ProgramProgressDto {
  programId: string;
  programRevisionId: string;
  currentDaySequence: number;
  completedDayCount: number;
  skippedDayCount: number;
  version: number;
}

export interface ProgramProgressResponseDto {
  data: { progress: ProgramProgressDto };
}

export interface WorkoutSetDto {
  setKey: string;
  setIndex: number;
  setType: string;
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  distance?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  notes?: string;
}

export interface WorkoutExerciseDto {
  workoutExerciseKey: string;
  prescriptionId: string;
  exerciseId: string;
  exerciseNameSnapshot: string;
  order: number;
  setStructure: string;
  targetSets: number;
  repRange?: { min?: number; max?: number };
  targetWeight?: number;
  restSeconds?: number;
  tempo?: string;
  rpe?: number;
  rir?: number;
  groupId?: string;
  groupType?: string;
  notes?: string;
  sets: WorkoutSetDto[];
}

export interface WorkoutDto {
  id: string;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  traineeUserId: UserId;
  programId: string;
  programRevisionId: string;
  dayKey: string;
  daySequence: number;
  performedByUserId: UserId;
  status: WorkoutStatus;
  startedAt: ApiTimestamp;
  completedAt?: ApiTimestamp;
  traineeEditableUntil?: ApiTimestamp;
  abandonedAt?: ApiTimestamp;
  abandonmentReason?: string;
  exercises: WorkoutExerciseDto[];
  notes?: string;
  version: number;
}

export interface WorkoutResponseDto {
  data: { workout: WorkoutDto };
}

export interface CurrentWorkoutResponseDto {
  data: { workout: WorkoutDto | null };
}

export type WorkoutListResponseDto = TrainingPageDto<WorkoutDto>;

export interface WorkoutPatchSetDto {
  setKey: string;
  weight?: number;
  reps?: number;
  durationSeconds?: number;
  distance?: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  notes?: string;
}

export interface WorkoutPatchExerciseDto {
  workoutExerciseKey: string;
  sets: WorkoutPatchSetDto[];
}

export interface WorkoutPatchBodyDto {
  expectedVersion: number;
  exercises: WorkoutPatchExerciseDto[];
  notes?: string;
  clientMutationId?: string;
}

export interface WorkoutCorrectionBodyDto extends WorkoutPatchBodyDto {
  reason: string;
}

export interface ExpectedVersionBodyDto {
  expectedVersion: number;
}

export interface PersonalRecordDto {
  id: string;
  exerciseId: string;
  recordType: PersonalRecordType;
  qualifierKey: string;
  value: number;
  sourceWorkoutId: string;
  sourceWorkoutVersion: number;
}

export interface PersonalRecordEventDto {
  id: string;
  exerciseId: string;
  recordType: PersonalRecordType;
  qualifierKey: string;
  eventType: PersonalRecordEventType;
  previousValue?: number;
  newValue?: number;
  sourceWorkoutId: string;
  sourceWorkoutVersion: number;
  occurredAt: ApiTimestamp;
}

export type PersonalRecordListResponseDto = TrainingPageDto<PersonalRecordDto>;
export type PersonalRecordEventListResponseDto = TrainingPageDto<PersonalRecordEventDto>;
