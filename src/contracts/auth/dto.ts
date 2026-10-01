import type { ApiEnvelope, ApiTimestamp, UserId } from '@/contracts/common/wire';

export const mobileAuthClientType = 'MOBILE' as const;
export type MobileAuthClientType = typeof mobileAuthClientType;

export const mfaFactorTypes = ['TOTP', 'RECOVERY_CODE'] as const;
export type MfaFactorType = (typeof mfaFactorTypes)[number];

export interface SafeUserDto {
  id: UserId;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface LoginRequestDto {
  identifier: string;
  password: string;
  clientType: MobileAuthClientType;
}

export interface RegisterRequestDto {
  email?: string;
  phone?: string;
  password: string;
  firstName: string;
  lastName: string;
  preferredLanguage: 'ar' | 'en';
  clientType: MobileAuthClientType;
}

export interface RefreshRequestDto {
  clientType: MobileAuthClientType;
  refreshToken: string;
}

export interface AuthTokenDataDto {
  accessToken: string;
  refreshToken?: string;
  user?: SafeUserDto;
  restrictedUntilVerified: boolean;
}

export interface NativeAuthTokenDataDto extends AuthTokenDataDto {
  refreshToken: string;
}

export interface MfaRequiredDataDto {
  status: 'MFA_REQUIRED';
  mfaChallengeToken: string;
  availableMethods: MfaFactorType[];
}

export type LoginResponseDto = ApiEnvelope<AuthTokenDataDto | MfaRequiredDataDto>;
export type AuthTokenResponseDto = ApiEnvelope<AuthTokenDataDto>;

export interface LogoutResponseDto {
  data: {
    success: true;
  };
}

export interface CurrentSessionDto {
  id: string;
  userId: UserId;
  status: 'ACTIVE' | 'REVOKED' | 'EXPIRED';
  restrictedUntilVerified: boolean;
  expiresAt: ApiTimestamp;
}

export function isMfaRequiredData(value: unknown): value is MfaRequiredDataDto {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    (value as { status?: unknown }).status === 'MFA_REQUIRED' &&
    typeof (value as { mfaChallengeToken?: unknown }).mfaChallengeToken === 'string'
  );
}

export function hasNativeRefreshToken(value: AuthTokenDataDto): value is NativeAuthTokenDataDto {
  return typeof value.refreshToken === 'string' && value.refreshToken.length > 0;
}
