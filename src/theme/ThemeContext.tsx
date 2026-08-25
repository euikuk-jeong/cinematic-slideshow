import { createContext, useContext } from 'react';

import type { ThemePreference } from '../settings/themePreference';
import { lightColors, type ThemeColors } from './colors';

export interface ThemeContextValue {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue>({
  colors: lightColors,
  scheme: 'light',
  preference: 'system',
  setPreference: () => {},
});

export function useAppTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}
