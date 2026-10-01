import type {
  ApiEnvelope,
  ApiPage,
  ApiTimestamp,
  ExpectedVersion,
  NotificationId,
  PushDeviceId,
  WorkspaceId,
} from '@/contracts/common/wire';

export const notificationChannels = ['email', 'push', 'inApp'] as const;
export type NotificationChannel = (typeof notificationChannels)[number];

export const pushDevicePlatforms = ['IOS', 'ANDROID', 'WEB'] as const;
export type PushDevicePlatform = (typeof pushDevicePlatforms)[number];

export interface NotificationDto {
  id: NotificationId;
  workspaceId?: WorkspaceId;
  eventType: string;
  notificationType: string;
  category: string;
  title: string;
  body: string;
  payload: Record<string, string>;
  readAt: ApiTimestamp | null;
  createdAt: ApiTimestamp;
}

export interface ListNotificationsQueryDto {
  cursor?: string;
  limit?: number;
  unread?: boolean;
}

export type NotificationPageDto = ApiPage<NotificationDto>;

export interface MarkAllNotificationsReadDto {
  data: {
    cutoffAt: ApiTimestamp;
    affectedCount: number;
  };
}

export type ChannelPreferencesDto = Partial<Record<NotificationChannel, boolean>>;

export interface NotificationPreferencesDto {
  channels: Record<NotificationChannel, boolean>;
  eventPreferences: Record<string, ChannelPreferencesDto>;
  version: number;
  updatedAt: ApiTimestamp;
}

export type NotificationPreferencesResponseDto = ApiEnvelope<NotificationPreferencesDto>;

export interface PutNotificationPreferencesRequestDto {
  expectedVersion: ExpectedVersion;
  channels?: ChannelPreferencesDto;
  eventPreferences?: Record<string, ChannelPreferencesDto>;
}

export interface PushDeviceRegistrationRequestDto {
  platform: PushDevicePlatform;
  provider: string;
  token: string;
  label?: string;
}

export interface PushDeviceDto {
  id: PushDeviceId;
  platform: PushDevicePlatform;
  provider: string;
  status: string;
  tokenFingerprint: string;
  lastSeenAt: ApiTimestamp;
  revokedAt: ApiTimestamp | null;
}

export type PushDeviceResponseDto = ApiEnvelope<PushDeviceDto>;

export const isPushDevicePlatform = (value: unknown): value is PushDevicePlatform =>
  typeof value === 'string' && pushDevicePlatforms.includes(value as PushDevicePlatform);
