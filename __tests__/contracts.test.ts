import {
  hasExplicitTimezoneOffset,
  hasNativeRefreshToken,
  isAnalyticsGranularity,
  isApiDateOnly,
  isApiErrorBody,
  isCoachingRelationshipStatus,
  isDocumentCategory,
  isMfaRequiredData,
  isMobileActorRole,
  isPermissionScope,
  isPushDevicePlatform,
  isSensitiveDocumentCategory,
  mobileAuthClientType,
} from '@/contracts';
import { describe, expect, it } from '@jest/globals';

describe('mobile contract runtime helpers', () => {
  it('recognizes locked mobile roles and backend permission scopes', () => {
    expect(isMobileActorRole('TRAINEE')).toBe(true);
    expect(isMobileActorRole('ASSISTANT_TRAINER')).toBe(true);
    expect(isMobileActorRole('PLATFORM_ADMIN')).toBe(false);

    expect(isPermissionScope('SELF')).toBe(true);
    expect(isPermissionScope('ASSIGNED_TRAINEES')).toBe(true);
    expect(isPermissionScope('EVERYTHING')).toBe(false);
  });

  it('keeps date-only and timestamp-with-offset contracts separate', () => {
    expect(isApiDateOnly('2026-10-01')).toBe(true);
    expect(isApiDateOnly('2026-10-01T00:00:00Z')).toBe(false);

    expect(hasExplicitTimezoneOffset('2026-10-01T00:00:00Z')).toBe(true);
    expect(hasExplicitTimezoneOffset('2026-10-01T00:00:00+02:00')).toBe(true);
    expect(hasExplicitTimezoneOffset('2026-10-01T00:00:00')).toBe(false);
  });

  it('recognizes native auth response branches without storing tokens', () => {
    expect(mobileAuthClientType).toBe('MOBILE');
    expect(
      isMfaRequiredData({
        status: 'MFA_REQUIRED',
        mfaChallengeToken: 'challenge',
        availableMethods: ['TOTP'],
      }),
    ).toBe(true);

    expect(hasNativeRefreshToken({ accessToken: 'access', restrictedUntilVerified: false })).toBe(
      false,
    );
    expect(
      hasNativeRefreshToken({
        accessToken: 'access',
        refreshToken: 'refresh',
        restrictedUntilVerified: false,
      }),
    ).toBe(true);
  });

  it('recognizes verified file, relationship, notification, and analytics literals', () => {
    expect(isSensitiveDocumentCategory('INBODY')).toBe(true);
    expect(isSensitiveDocumentCategory('DIET_DOCUMENT')).toBe(false);
    expect(isDocumentCategory('DIET_DOCUMENT')).toBe(true);

    expect(isCoachingRelationshipStatus('NEEDS_REASSIGNMENT')).toBe(true);
    expect(isPushDevicePlatform('ANDROID')).toBe(true);
    expect(isPushDevicePlatform('DESKTOP')).toBe(false);
    expect(isAnalyticsGranularity('week')).toBe(true);
    expect(isAnalyticsGranularity('quarter')).toBe(false);
  });

  it('recognizes backend error envelopes without assuming UI behavior', () => {
    expect(
      isApiErrorBody({
        error: { code: 'EXPECTED_VERSION_CONFLICT', message: 'Conflict', correlationId: 'abc' },
      }),
    ).toBe(true);
    expect(isApiErrorBody({ error: { code: 'BROKEN' } })).toBe(false);
    expect(isApiErrorBody(null)).toBe(false);
  });
});
