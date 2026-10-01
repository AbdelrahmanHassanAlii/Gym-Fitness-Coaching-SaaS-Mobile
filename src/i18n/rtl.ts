import { I18nManager } from 'react-native';

import { getLocaleDirection, type SupportedLocale } from './locales';

export function applyLocaleDirection(locale: SupportedLocale): { requiresRestart: boolean } {
  const shouldUseRtl = getLocaleDirection(locale) === 'rtl';

  I18nManager.allowRTL(true);

  if (I18nManager.isRTL !== shouldUseRtl) {
    I18nManager.forceRTL(shouldUseRtl);

    return { requiresRestart: true };
  }

  return { requiresRestart: false };
}
