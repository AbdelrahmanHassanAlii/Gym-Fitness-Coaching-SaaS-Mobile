export const DEFAULT_LOCALE = 'en';

export const SUPPORTED_LOCALES = {
  en: {
    label: 'English',
    nativeLabel: 'English',
    direction: 'ltr',
  },
  ar: {
    label: 'Arabic',
    nativeLabel: 'العربية',
    direction: 'rtl',
  },
} as const;

export type SupportedLocale = keyof typeof SUPPORTED_LOCALES;
export type TextDirection = (typeof SUPPORTED_LOCALES)[SupportedLocale]['direction'];

export const LANGUAGE_STORAGE_KEY = 'hassan-gym.language';

export function isSupportedLocale(locale: string): locale is SupportedLocale {
  return Object.hasOwn(SUPPORTED_LOCALES, locale);
}

export function normalizeLocale(locale: string | null | undefined): SupportedLocale | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.trim().toLowerCase().replace('_', '-');
  const language = normalized.split('-')[0];

  if (isSupportedLocale(normalized)) {
    return normalized;
  }

  if (isSupportedLocale(language)) {
    return language;
  }

  return null;
}

export function getLocaleDirection(locale: SupportedLocale): TextDirection {
  return SUPPORTED_LOCALES[locale].direction;
}

export function resolveLocale({
  storedLocale,
  deviceLocales,
}: {
  storedLocale?: string | null;
  deviceLocales?: readonly (string | null | undefined)[];
}): SupportedLocale {
  const explicitLocale = normalizeLocale(storedLocale);

  if (explicitLocale) {
    return explicitLocale;
  }

  for (const deviceLocale of deviceLocales ?? []) {
    const supportedDeviceLocale = normalizeLocale(deviceLocale);

    if (supportedDeviceLocale) {
      return supportedDeviceLocale;
    }
  }

  return DEFAULT_LOCALE;
}
