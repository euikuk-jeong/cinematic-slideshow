export interface ThemeColors {
  accent: string;
  accentSoft: string;
  hairline: string;
  textSecondary: string;
  ink: string;
  background: string;
  surface: string;
  scrim: string;
}

export const lightColors: ThemeColors = {
  accent: '#FC836D',
  accentSoft: '#FFF1EE',
  hairline: '#E4DED5',
  textSecondary: '#6B655C',
  ink: '#1C1B1A',
  background: '#FFFFFF',
  surface: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.45)',
};

export const darkColors: ThemeColors = {
  accent: '#FC836D',
  accentSoft: '#4A2E27',
  hairline: '#3A3733',
  textSecondary: '#A39C91',
  ink: '#F2EFEA',
  background: '#121212',
  surface: '#1E1E1E',
  scrim: 'rgba(0,0,0,0.45)',
};
