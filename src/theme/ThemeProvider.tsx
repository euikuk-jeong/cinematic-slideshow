import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { getAppSetting, setAppSetting } from '../db/client';
import {
  parseThemePreference,
  resolveColorScheme,
  THEME_PREFERENCE_STORAGE_KEY,
  type ColorScheme,
  type ThemePreference,
} from '../settings/themePreference';
import { darkColors, lightColors } from './colors';
import { ThemeContext, type ThemeContextValue } from './ThemeContext';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    let cancelled = false;
    getAppSetting(THEME_PREFERENCE_STORAGE_KEY).then((raw) => {
      if (!cancelled) setPreferenceState(parseThemePreference(raw));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    setAppSetting(THEME_PREFERENCE_STORAGE_KEY, next);
  }, []);

  const scheme = resolveColorScheme(preference, systemScheme as ColorScheme | null);
  const value = useMemo<ThemeContextValue>(
    () => ({ colors: scheme === 'dark' ? darkColors : lightColors, scheme, preference, setPreference }),
    [scheme, preference, setPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
