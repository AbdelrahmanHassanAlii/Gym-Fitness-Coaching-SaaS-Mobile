import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  type AppearanceMode,
  type ResolvedAppearance,
  type ThemeId,
  type ThemeTokens,
  appearanceModes,
  themeIds,
  themes,
} from './tokens';

const themePreferenceKey = 'preferences.theme';
const appearancePreferenceKey = 'preferences.appearance';

type ThemeContextValue = {
  theme: ThemeTokens;
  themeId: ThemeId;
  appearanceMode: AppearanceMode;
  resolvedAppearance: ResolvedAppearance;
  setThemeId: (themeId: ThemeId) => void;
  setAppearanceMode: (appearanceMode: AppearanceMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string | null): value is ThemeId {
  return themeIds.includes(value as ThemeId);
}

function isAppearanceMode(value: string | null): value is AppearanceMode {
  return appearanceModes.includes(value as AppearanceMode);
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme();
  const [themeId, setThemeIdState] = useState<ThemeId>('default');
  const [appearanceMode, setAppearanceModeState] =
    useState<AppearanceMode>('system');

  useEffect(() => {
    let isMounted = true;

    async function hydratePreferences() {
      const [storedThemeId, storedAppearanceMode] = await Promise.all([
        AsyncStorage.getItem(themePreferenceKey),
        AsyncStorage.getItem(appearancePreferenceKey),
      ]);

      if (!isMounted) {
        return;
      }

      if (isThemeId(storedThemeId)) {
        setThemeIdState(storedThemeId);
      }

      if (isAppearanceMode(storedAppearanceMode)) {
        setAppearanceModeState(storedAppearanceMode);
      }
    }

    void hydratePreferences();

    return () => {
      isMounted = false;
    };
  }, []);

  const resolvedAppearance: ResolvedAppearance =
    appearanceMode === 'system'
      ? systemColorScheme === 'dark'
        ? 'dark'
        : 'light'
      : appearanceMode;

  const setThemeId = (nextThemeId: ThemeId) => {
    setThemeIdState(nextThemeId);
    void AsyncStorage.setItem(themePreferenceKey, nextThemeId);
  };

  const setAppearanceMode = (nextAppearanceMode: AppearanceMode) => {
    setAppearanceModeState(nextAppearanceMode);
    void AsyncStorage.setItem(appearancePreferenceKey, nextAppearanceMode);
  };

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme: themes[themeId][resolvedAppearance],
      themeId,
      appearanceMode,
      resolvedAppearance,
      setThemeId,
      setAppearanceMode,
    }),
    [appearanceMode, resolvedAppearance, themeId],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    throw new Error('useTheme must be used within ThemeProvider.');
  }

  return value;
}
