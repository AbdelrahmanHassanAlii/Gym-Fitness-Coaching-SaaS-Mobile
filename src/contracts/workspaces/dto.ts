import type {
  ApiEnvelope,
  ApiTimestamp,
  IanaTimezone,
  UserId,
  WorkspaceId,
  WorkspaceMembershipId,
  WorkspaceMembershipRole,
} from '@/contracts/common/wire';

export type WorkspaceType = 'GYM' | 'INDEPENDENT_TRAINER';
export type WorkspaceStatus = 'ACTIVE' | 'PENDING_ACTIVATION' | 'SUSPENDED' | 'ARCHIVED';
export type WorkspaceMembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED' | 'ENDED';

export interface MyWorkspaceDto {
  id: WorkspaceId;
  type: WorkspaceType;
  name: string;
  ownerUserId: UserId;
  status: WorkspaceStatus;
  timezone: IanaTimezone;
  defaultLanguage: 'ar' | 'en';
  country?: string;
  city?: string;
  governorate?: string;
}

export interface MyWorkspaceMembershipDto {
  id: WorkspaceMembershipId;
  workspaceId: WorkspaceId;
  userId: UserId;
  roles: WorkspaceMembershipRole[];
  status: WorkspaceMembershipStatus;
  permissionProfileIds: string[];
  accessVersion: number;
  joinedAt: ApiTimestamp;
  endedAt?: ApiTimestamp;
  engagementPeriods: {
    startedAt: ApiTimestamp;
    endedAt?: ApiTimestamp;
  }[];
}

export interface MyWorkspaceContextDto {
  workspace: MyWorkspaceDto;
  membership: MyWorkspaceMembershipDto;
}

export type MyWorkspacesResponseDto = ApiEnvelope<MyWorkspaceContextDto[]>;
