import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DEFAULT_LOCALE,
  LANGUAGE_STORAGE_KEY,
  getLocaleDirection,
  normalizeLocale,
  resolveLocale,
} from '../src/i18n/locales';
import { translate } from '../src/i18n/messages';
import { getStoredLocale, persistLocale } from '../src/i18n/persistence';
import { applyLocaleDirection } from '../src/i18n/rtl';

describe('i18n foundation', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('normalizes supported region variants and rejects unsupported locales', () => {
    expect(normalizeLocale('ar-EG')).toBe('ar');
    expect(normalizeLocale('en_US')).toBe('en');
    expect(normalizeLocale('fr-FR')).toBeNull();
  });

  it('prefers explicit stored language, then device locale, then English fallback', () => {
    expect(resolveLocale({ storedLocale: 'ar', deviceLocales: ['en-US'] })).toBe(
      'ar',
    );
    expect(resolveLocale({ deviceLocales: ['ar-EG'] })).toBe('ar');
    expect(resolveLocale({ deviceLocales: ['fr-FR'] })).toBe(DEFAULT_LOCALE);
  });

  it('returns expected directions and English fallback messages', () => {
    expect(getLocaleDirection('en')).toBe('ltr');
    expect(getLocaleDirection('ar')).toBe('rtl');
    expect(translate('ar', 'languageLabel')).toBe('اللغة');
  });

  it('persists language under the non-sensitive language key only', async () => {
    await persistLocale('ar');

    await expect(getStoredLocale()).resolves.toBe('ar');
    await expect(AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)).resolves.toBe(
      'ar',
    );
    await expect(AsyncStorage.getItem('preferences.theme')).resolves.toBeNull();
    await expect(
      AsyncStorage.getItem('preferences.appearance'),
    ).resolves.toBeNull();
  });

  it('reports restart requirement when native RTL state changes', () => {
    expect(applyLocaleDirection('ar')).toEqual({ requiresRestart: true });
    expect(applyLocaleDirection('en')).toEqual({ requiresRestart: false });
  });
});
