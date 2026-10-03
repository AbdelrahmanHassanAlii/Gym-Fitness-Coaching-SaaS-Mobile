import type {
  BranchId,
  RelationshipId,
  UserId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts';
import type { CoachingRelationshipStatus } from '@/contracts/relationships/dto';
import type { TraineeRelationshipDashboardDto } from '@/trainee/contracts';

export interface StaffRelationshipSummaryDto {
  id: RelationshipId;
  workspaceId: WorkspaceId;
  traineeUserId: UserId;
  traineeMembershipId?: WorkspaceMembershipId;
  homeBranchId?: BranchId;
  status: CoachingRelationshipStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface StaffRelationshipListResponseDto {
  data: StaffRelationshipSummaryDto[];
  meta?: {
    nextCursor?: string | null;
    hasMore?: boolean;
  };
}

export type StaffRelationshipDashboardDto = TraineeRelationshipDashboardDto;
export interface StaffRelationshipDashboardResponseDto {
  data: StaffRelationshipDashboardDto;
}
