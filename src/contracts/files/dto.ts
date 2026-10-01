import type {
  ApiEnvelope,
  ApiPage,
  ApiTimestamp,
  DocumentId,
  ExpectedVersion,
  FileId,
  RelationshipId,
  WorkspaceId,
} from '@/contracts/common/wire';

export const uploadPurposes = ['DOCUMENT', 'PROGRESS_PHOTO', 'GENERIC'] as const;
export type UploadPurpose = (typeof uploadPurposes)[number];

export const uploadSubjectTypes = ['COACHING_RELATIONSHIP', 'WORKSPACE'] as const;
export type UploadSubjectType = (typeof uploadSubjectTypes)[number];

export const fileClassifications = ['STANDARD', 'SENSITIVE'] as const;
export type FileClassification = (typeof fileClassifications)[number];

export const documentCategories = [
  'INBODY',
  'BLOOD_TEST',
  'MEDICAL_REPORT',
  'DIET_DOCUMENT',
  'TRAINING_DOCUMENT',
  'INJURY_REPORT',
  'OTHER',
] as const;
export type DocumentCategory = (typeof documentCategories)[number];

export const sensitiveDocumentCategories = [
  'INBODY',
  'BLOOD_TEST',
  'MEDICAL_REPORT',
  'INJURY_REPORT',
] as const satisfies readonly DocumentCategory[];
export type SensitiveDocumentCategory = (typeof sensitiveDocumentCategories)[number];

export const fileStatuses = ['ACTIVE', 'SOFT_DELETED', 'PURGE_PENDING', 'PURGED'] as const;
export type FileStatus = (typeof fileStatuses)[number];

export const documentStatuses = ['ACTIVE', 'DELETED'] as const;
export type DocumentStatus = (typeof documentStatuses)[number];

export interface UploadIntentRequestDto {
  purpose: UploadPurpose;
  subjectType: UploadSubjectType;
  subjectId?: RelationshipId | WorkspaceId;
  fileName: string;
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | string;
  sizeBytes: number;
  checksumSha256?: string;
  classification?: FileClassification;
  sensitive?: boolean;
}

export interface UploadIntentDto {
  uploadIntentId: string;
  uploadUrl: string;
  expiresAt: ApiTimestamp;
  uploadUrlExpiresAt: ApiTimestamp;
  reservedBytes: number;
  expectedVersion: ExpectedVersion;
}

export type UploadIntentResponseDto = ApiEnvelope<UploadIntentDto>;

export interface ConfirmUploadRequestDto {
  expectedVersion: number;
}

export interface FileDto {
  id: FileId;
  status: FileStatus;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  classification: FileClassification;
  version: number;
  createdAt: ApiTimestamp;
  confirmedAt?: ApiTimestamp;
}

export type ConfirmUploadResponseDto = ApiEnvelope<{ file: FileDto }>;

export interface CreateDocumentRequestDto {
  fileId: FileId;
  category: DocumentCategory;
  title?: string;
  description?: string;
  classification?: FileClassification;
  documentDate?: ApiTimestamp;
}

export interface DocumentDto {
  id: DocumentId;
  relationshipId: RelationshipId;
  fileId: FileId;
  category: DocumentCategory;
  classification: FileClassification;
  status: DocumentStatus;
  version: number;
  title?: string;
  description?: string;
  documentDate?: ApiTimestamp;
  createdAt: ApiTimestamp;
}

export type DocumentResponseDto = ApiEnvelope<{ document: DocumentDto }>;
export type DocumentPageDto = ApiPage<DocumentDto>;

export interface DownloadUrlDto {
  url: string;
  expiresAt: ApiTimestamp;
}

export type DownloadUrlResponseDto = ApiEnvelope<DownloadUrlDto>;

export interface ExpectedVersionRequestDto {
  expectedVersion: number;
}

export const isSensitiveDocumentCategory = (
  value: unknown,
): value is SensitiveDocumentCategory =>
  typeof value === 'string' &&
  sensitiveDocumentCategories.includes(value as SensitiveDocumentCategory);

export const isDocumentCategory = (value: unknown): value is DocumentCategory =>
  typeof value === 'string' && documentCategories.includes(value as DocumentCategory);
