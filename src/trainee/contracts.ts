import type {
  ApiEnvelope,
  ApiTimestamp,
  BranchId,
  CoachingRelationshipStatus,
  RelationshipId,
  RelationshipAssignmentRole,
  UserId,
  WorkspaceId,
} from '@/contracts';

export interface TraineeRelationshipDashboardDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  generatedAt: ApiTimestamp;
  relationship: {
    status: CoachingRelationshipStatus;
    traineeUserId?: UserId;
    homeBranchId: BranchId | null;
  };
  assignedStaff: {
    assignmentType: RelationshipAssignmentRole;
    startedAt: ApiTimestamp;
  }[];
  training: {
    summary?: {
      startedSessions?: number;
      completedSessions?: number;
      abandonedSessions?: number;
      programDaysCompleted?: number;
      programDaysSkipped?: number;
      programDaysDeferred?: number;
      workoutAdherenceRate?: number | null;
      prCount?: number;
    };
  } | null;
  nutrition: {
    activePlan?: { id: string; name: string } | null;
    nutritionTracking?: { daysTracked?: number; averageAdherenceRate?: number | null };
    waterTracking?: { daysTracked?: number; averageMl?: number | null; targetMl?: number | null };
  } | null;
  progress: unknown | null;
  checkIns: {
    dueCount?: number;
    submittedOrReviewedCount?: number;
    complianceRate?: number | null;
  } | null;
  adherence: unknown | null;
  needsAttention: unknown;
  access: {
    actorKind: 'TRAINEE' | 'TRAINER' | 'ASSISTANT_TRAINER' | 'NUTRITIONIST' | 'OWNER' | 'MANAGER';
    sections: {
      training?: boolean;
      nutrition?: boolean;
      progress?: boolean;
      checkIns?: boolean;
    };
  };
}

export type TraineeRelationshipDashboardResponseDto =
  ApiEnvelope<TraineeRelationshipDashboardDto>;
