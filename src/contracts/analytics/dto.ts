import type {
  ApiDateOnly,
  ApiPage,
  ApiTimestamp,
  BranchId,
  Cursor,
  IanaTimezone,
  RelationshipId,
} from '@/contracts/common/wire';

export const analyticsGranularities = ['none', 'day', 'week', 'month'] as const;
export type AnalyticsGranularity = (typeof analyticsGranularities)[number];

export const attentionCategories = [
  'CHECKIN_OVERDUE',
  'CHECKIN_PENDING_REVIEW',
  'NO_WORKOUT_ACTIVITY_7_DAYS',
  'NO_ACTIVE_PROGRAM',
  'NO_ACTIVE_NUTRITION_PLAN',
  'NEEDS_REASSIGNMENT',
] as const;
export type AttentionCategory = (typeof attentionCategories)[number];

export const activityCategories = [
  'WORKOUT_COMPLETED',
  'PR_ACHIEVED',
  'CHECKIN_SUBMITTED',
  'INBODY_UPLOADED',
] as const;
export type ActivityCategory = (typeof activityCategories)[number];

export interface AnalyticsRangeQueryDto {
  from?: ApiDateOnly;
  to?: ApiDateOnly;
  granularity?: Exclude<AnalyticsGranularity, 'none' | 'month'>;
}

export interface ProgressAnalyticsQueryDto {
  from?: ApiDateOnly;
  to?: ApiDateOnly;
  granularity?: AnalyticsGranularity;
  metricDefinitionId?: string;
  limit?: number;
  cursor?: Cursor;
}

export interface DashboardCursorQueryDto {
  attentionCategory?: AttentionCategory;
  attentionCursor?: Cursor;
  attentionLimit?: number;
  branchId?: BranchId;
  branchCursor?: Cursor;
  branchLimit?: number;
  activityCategory?: ActivityCategory;
  activityCursor?: Cursor;
  activityLimit?: number;
}

export interface AnalyticsRangeDto {
  from: ApiTimestamp;
  to: ApiTimestamp;
  timezone: IanaTimezone;
}

export interface RelationshipAnalyticsPointDto {
  relationshipId: RelationshipId;
  label: string;
  value: number | null;
  occurredAt?: ApiTimestamp;
}

export type RelationshipAnalyticsPageDto = ApiPage<RelationshipAnalyticsPointDto>;

export const isAnalyticsGranularity = (value: unknown): value is AnalyticsGranularity =>
  typeof value === 'string' && analyticsGranularities.includes(value as AnalyticsGranularity);
