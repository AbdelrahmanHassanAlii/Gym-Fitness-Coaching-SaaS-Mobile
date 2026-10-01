import { DEFAULT_LOCALE, type SupportedLocale } from './locales';

const en = {
  appTitle: 'Hassan Gym & Fitness Coaching',
  appSubtitle: 'Mobile app foundation',
  languageLabel: 'Language',
  directionNotice: 'Restart the app to fully apply layout direction.',
  authLoginTitle: 'Sign in',
  authIdentifier: 'Email or phone',
  authPassword: 'Password',
  authLogin: 'Sign in',
  authLoading: 'Loading',
  authLogout: 'Sign out',
  authSessionTitle: 'Session',
  authSignedInFallback: 'Signed in',
  authMfaRequired: 'Multi-factor verification is required.',
  authSecurityFailure: 'Session storage needs attention. Sign in again when ready.',
} as const;

const ar: Record<keyof typeof en, string> = {
  appTitle: 'حسن للتدريب الرياضي واللياقة',
  appSubtitle: 'أساس تطبيق الهاتف',
  languageLabel: 'اللغة',
  directionNotice: 'أعد تشغيل التطبيق لتطبيق اتجاه الواجهة بالكامل.',
  authLoginTitle: 'تسجيل الدخول',
  authIdentifier: 'البريد الإلكتروني أو الهاتف',
  authPassword: 'كلمة المرور',
  authLogin: 'تسجيل الدخول',
  authLoading: 'جار التحميل',
  authLogout: 'تسجيل الخروج',
  authSessionTitle: 'الجلسة',
  authSignedInFallback: 'تم تسجيل الدخول',
  authMfaRequired: 'مطلوب التحقق متعدد العوامل.',
  authSecurityFailure: 'تحتاج بيانات الجلسة الآمنة إلى مراجعة. سجل الدخول مرة أخرى عندما تكون جاهزا.',
};

export const MESSAGES: Record<SupportedLocale, Record<TranslationKey, string>> = {
  en,
  ar,
};

export type TranslationKey = keyof typeof en;

export function translate(locale: SupportedLocale, key: TranslationKey): string {
  return MESSAGES[locale]?.[key] ?? MESSAGES[DEFAULT_LOCALE][key];
}
