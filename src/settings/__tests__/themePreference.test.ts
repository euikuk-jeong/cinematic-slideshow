import { parseThemePreference, resolveColorScheme } from '../themePreference';

describe('parseThemePreference', () => {
  test('저장된 값이 유효한 preference면 그대로 반환한다', () => {
    expect(parseThemePreference('light')).toBe('light');
    expect(parseThemePreference('dark')).toBe('dark');
    expect(parseThemePreference('system')).toBe('system');
  });

  test('null이거나 알 수 없는 값이면 system으로 기본화한다', () => {
    expect(parseThemePreference(null)).toBe('system');
    expect(parseThemePreference('')).toBe('system');
    expect(parseThemePreference('auto')).toBe('system');
  });
});

describe('resolveColorScheme', () => {
  test('light/dark preference는 시스템 설정과 무관하게 그대로 적용된다', () => {
    expect(resolveColorScheme('light', 'dark')).toBe('light');
    expect(resolveColorScheme('dark', 'light')).toBe('dark');
  });

  test('system preference는 시스템 설정을 따른다', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark');
    expect(resolveColorScheme('system', 'light')).toBe('light');
  });

  test('system preference에서 시스템 설정이 null/undefined면 light로 기본화한다', () => {
    expect(resolveColorScheme('system', null)).toBe('light');
    expect(resolveColorScheme('system', undefined)).toBe('light');
  });
});
