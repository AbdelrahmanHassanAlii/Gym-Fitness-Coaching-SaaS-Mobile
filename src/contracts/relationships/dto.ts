import type {
  ApiPage,
  ApiTimestamp,
  BranchId,
  RelationshipId,
  UserId,
  WorkspaceId,
  WorkspaceMembershipId,
} from '@/contracts/common/wire';

export const coachingRelationshipStatuses = [
  'PENDING',
  'ACTIVE',
  'NEEDS_REASSIGNMENT',
  'ENDED',
  'REJECTED',
] as const;
export type CoachingRelationshipStatus = (typeof coachingRelationshipStatuses)[number];

export const relationshipAssignmentRoles = [
  'PRIMARY_TRAINER',
  'ASSISTANT_TRAINER',
  'NUTRITIONIST',
] as const;
export type RelationshipAssignmentRole = (typeof relationshipAssignmentRoles)[number];

export interface RelationshipSummaryDto {
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

export interface RelationshipAssignmentDto {
  id: string;
  relationshipId: RelationshipId;
  staffMembershipId: WorkspaceMembershipId;
  role: RelationshipAssignmentRole;
  activeFrom: ApiTimestamp;
  activeTo?: ApiTimestamp | null;
}

export type RelationshipPageDto = ApiPage<RelationshipSummaryDto>;

export interface VersionedRelationshipCommandDto {
  expectedVersion: number;
}

export const isCoachingRelationshipStatus = (
  value: unknown,
): value is CoachingRelationshipStatus =>
  typeof value === 'string' &&
  coachingRelationshipStatuses.includes(value as CoachingRelationshipStatus);
