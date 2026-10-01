import { getLocales } from 'expo-localization';

export function getDeviceLocaleTags(): string[] {
  return getLocales()
    .map((locale) => locale.languageTag ?? locale.languageCode)
    .filter((locale): locale is string => Boolean(locale));
}
