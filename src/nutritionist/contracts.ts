import type {
  ApiEnvelope,
  ApiTimestamp,
  BranchId,
  Cursor,
  RelationshipId,
  UserId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import type { AnalyticsGranularity, AnalyticsRangeDto } from '@/contracts/analytics/dto';
import type { CoachingRelationshipStatus } from '@/contracts/relationships/dto';
import type { TraineeRelationshipDashboardDto } from '@/trainee/contracts';

export interface NutritionistRelationshipSummaryDto {
  id: RelationshipId;
  workspaceId: WorkspaceId;
  traineeUserId: UserId;
  traineeMembershipId?: WorkspaceMembershipId;
  homeBranchId?: BranchId;
  status: CoachingRelationshipStatus;
  version: number;
  createdAt: ApiTimestamp;
  updatedAt: ApiTimestamp;
}

export interface NutritionistRelationshipListResponseDto {
  data: NutritionistRelationshipSummaryDto[];
  meta?: {
    nextCursor?: Cursor | null;
    hasMore?: boolean;
  };
}

export type NutritionistRelationshipDashboardDto = TraineeRelationshipDashboardDto & {
  access: TraineeRelationshipDashboardDto['access'] & {
    actorKind: 'NUTRITIONIST';
  };
};

export interface NutritionistRelationshipDashboardResponseDto {
  data: NutritionistRelationshipDashboardDto;
}

export type NutritionPlanStatus = 'DRAFT' | 'ACTIVE' | 'REPLACED' | 'COMPLETED' | 'ARCHIVED';

export interface NutritionPlanSummaryDto {
  id: string;
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  name: string;
  status: NutritionPlanStatus;
  responsibleMembershipId: WorkspaceMembershipId;
  currentRevisionId: string;
  startedAt?: ApiTimestamp | null;
  endedAt?: ApiTimestamp | null;
  version: number;
}

export interface NutritionPlanListResponseDto {
  data: NutritionPlanSummaryDto[];
  nextCursor?: Cursor | null;
}

export interface NutritionAnalyticsDto {
  workspaceId: WorkspaceId;
  relationshipId: RelationshipId;
  range: AnalyticsRangeDto;
  granularity?: AnalyticsGranularity;
  activePlan: { id: string; name: string } | null;
  targets: {
    targetCalories: number | null;
    targetProteinG: number | null;
    targetCarbsG: number | null;
    targetFatG: number | null;
    waterTargetMl: number | null;
  } | null;
  nutritionTracking: {
    daysTracked: number;
    averageAdherenceRate: number | null;
  };
  waterTracking: {
    daysTracked: number;
    averageMl: number | null;
    targetMl: number | null;
  };
  series: unknown[];
}

export type NutritionAnalyticsResponseDto = ApiEnvelope<NutritionAnalyticsDto>;
