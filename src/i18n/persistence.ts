import AsyncStorage from '@react-native-async-storage/async-storage';

import { LANGUAGE_STORAGE_KEY, normalizeLocale, type SupportedLocale } from './locales';

export async function getStoredLocale(): Promise<SupportedLocale | null> {
  const storedLocale = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);

  return normalizeLocale(storedLocale);
}

export async function persistLocale(locale: SupportedLocale): Promise<void> {
  await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, locale);
}
