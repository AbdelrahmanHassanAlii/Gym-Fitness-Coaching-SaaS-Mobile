import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getDeviceLocaleTags } from './src/i18n/device';
import { getLocaleDirection, resolveLocale, SUPPORTED_LOCALES, type SupportedLocale } from './src/i18n/locales';
import { translate } from './src/i18n/messages';
import { getStoredLocale, persistLocale } from './src/i18n/persistence';
import { applyLocaleDirection } from './src/i18n/rtl';

export default function App() {
  const [locale, setLocale] = useState<SupportedLocale>(() =>
    resolveLocale({ deviceLocales: getDeviceLocaleTags() }),
  );
  const [requiresRestart, setRequiresRestart] = useState(() => applyLocaleDirection(locale).requiresRestart);
  const direction = getLocaleDirection(locale);
  const t = useMemo(() => (key: Parameters<typeof translate>[1]) => translate(locale, key), [locale]);

  useEffect(() => {
    let isMounted = true;

    async function loadLocalePreference() {
      const storedLocale = await getStoredLocale();
      const resolvedLocale = resolveLocale({
        storedLocale,
        deviceLocales: getDeviceLocaleTags(),
      });
      const directionState = applyLocaleDirection(resolvedLocale);

      if (isMounted) {
        setLocale(resolvedLocale);
        setRequiresRestart(directionState.requiresRestart);
      }
    }

    void loadLocalePreference();

    return () => {
      isMounted = false;
    };
  }, []);

  async function selectLocale(nextLocale: SupportedLocale) {
    const directionState = applyLocaleDirection(nextLocale);

    setLocale(nextLocale);
    setRequiresRestart(directionState.requiresRestart);
    await persistLocale(nextLocale);
  }

  return (
    <View style={[styles.container, direction === 'rtl' && styles.containerRtl]}>
      <Text style={[styles.title, styles.localizedText, { writingDirection: direction }]}>{t('appTitle')}</Text>
      <Text style={[styles.subtitle, styles.localizedText, { writingDirection: direction }]}>{t('appSubtitle')}</Text>

      <View style={styles.languageGroup}>
        <Text style={[styles.languageLabel, { writingDirection: direction }]}>{t('languageLabel')}</Text>
        <View style={[styles.languageButtons, direction === 'rtl' && styles.languageButtonsRtl]}>
          {(['en', 'ar'] as const).map((option) => {
            const isSelected = locale === option;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                key={option}
                onPress={() => void selectLocale(option)}
                style={[styles.languageButton, isSelected && styles.languageButtonSelected]}
              >
                <Text style={[styles.languageButtonText, isSelected && styles.languageButtonTextSelected]}>
                  {SUPPORTED_LOCALES[option].nativeLabel}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {requiresRestart ? (
        <Text style={[styles.directionNotice, { writingDirection: direction }]}>{t('directionNotice')}</Text>
      ) : null}

      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'stretch',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  containerRtl: {
    direction: 'rtl',
  },
  localizedText: {
    alignSelf: 'stretch',
    textAlign: 'center',
  },
  title: {
    color: '#111827',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    color: '#4B5563',
    fontSize: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  languageGroup: {
    alignItems: 'center',
    marginTop: 32,
  },
  languageLabel: {
    color: '#374151',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  languageButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButtonsRtl: {
    flexDirection: 'row-reverse',
  },
  languageButton: {
    borderColor: '#D1D5DB',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  languageButtonSelected: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  languageButtonText: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '600',
  },
  languageButtonTextSelected: {
    color: '#FFFFFF',
  },
  directionNotice: {
    color: '#92400E',
    fontSize: 13,
    marginTop: 20,
    textAlign: 'center',
  },
});
