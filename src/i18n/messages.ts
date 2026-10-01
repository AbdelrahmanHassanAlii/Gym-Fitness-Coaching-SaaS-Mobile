import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const en = {
  appTitle: 'Hassan Gym & Fitness Coaching',
  appSubtitle: 'Mobile app foundation',
  languageLabel: 'Language',
  directionNotice: 'Restart the app to fully apply layout direction.',
} as const;

const ar: Record<keyof typeof en, string> = {
  appTitle: 'حسن للتدريب الرياضي واللياقة',
  appSubtitle: 'أساس تطبيق الهاتف',
  languageLabel: 'اللغة',
  directionNotice: 'أعد تشغيل التطبيق لتطبيق اتجاه الواجهة بالكامل.',
};

export const MESSAGES: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en,
  ar,
};

export type TranslationKey = keyof typeof en;

export function translate(locale: SupportedLocale, key: TranslationKey): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key];
}
