// eslint-disable-next-line @typescript-eslint/no-require-imports
const appConfig = require('../app.config.js');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const appJson = require('../app.json');

const { versionCodeFromVersion } = appConfig;

describe('versionCodeFromVersion', () => {
  it('MAJOR*10000 + MINOR*100 + PATCH로 변환한다', () => {
    expect(versionCodeFromVersion('1.1.3')).toBe(10103);
    expect(versionCodeFromVersion('0.10.0')).toBe(1000);
    expect(versionCodeFromVersion('2.0.0')).toBe(20000);
    expect(versionCodeFromVersion('1.99.99')).toBe(19999);
  });

  it('semver 순서와 versionCode 순서가 일치한다', () => {
    const ordered = ['1.1.2', '1.1.3', '1.2.0', '1.10.0', '2.0.0'];
    const codes: number[] = ordered.map(versionCodeFromVersion);
    expect([...codes].sort((a, b) => a - b)).toEqual(codes);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('MAJOR.MINOR.PATCH 형식이 아니면 throw한다', () => {
    expect(() => versionCodeFromVersion('1.1')).toThrow();
    expect(() => versionCodeFromVersion('1.1.3-beta')).toThrow();
    expect(() => versionCodeFromVersion(undefined)).toThrow();
  });

  it('MINOR/PATCH가 99를 넘으면 throw한다(다음 자리와 겹침 방지)', () => {
    expect(() => versionCodeFromVersion('1.100.0')).toThrow();
    expect(() => versionCodeFromVersion('1.0.100')).toThrow();
  });
});

describe('app.config.js', () => {
  it('app.json version에서 android.versionCode/ios.buildNumber를 파생한다', () => {
    const config = appConfig({ config: appJson.expo });
    const expected = versionCodeFromVersion(appJson.expo.version);
    expect(config.android.versionCode).toBe(expected);
    expect(config.ios.buildNumber).toBe(String(expected));
    expect(config.android.package).toBe(appJson.expo.android.package);
  });
});

describe('미디어 권한 선언(갤러리)', () => {
  const plugins: Array<string | [string, Record<string, unknown>]> = appJson.expo.plugins;
  const mediaLibraryPlugin = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-media-library') as [string, { granularPermissions: string[] }];

  it('expo-media-library 매니페스트 선언에 photo, audio, video가 모두 있다', () => {
    expect(mediaLibraryPlugin[1].granularPermissions).toEqual(expect.arrayContaining(['photo', 'audio', 'video']));
  });

  it('android.permissions에 READ_MEDIA_VIDEO가 있다', () => {
    expect(appJson.expo.android.permissions).toContain('android.permission.READ_MEDIA_VIDEO');
  });

  // WRITE_EXTERNAL_STORAGE는 갤러리 이전부터 선언돼 있던 항목이라(API 30+에선 무효) 이 테스트가
  // 고정하지 않는다 — 갤러리가 새로 요구하는 광범위 권한만 금지한다.
  it('전체 파일/미디어 관리 권한(MANAGE_*)은 선언하지 않는다', () => {
    const declared: string[] = appJson.expo.android?.permissions ?? [];
    for (const forbidden of ['MANAGE_EXTERNAL_STORAGE', 'MANAGE_MEDIA']) {
      expect(declared).not.toContain(forbidden);
      expect(declared).not.toContain(`android.permission.${forbidden}`);
    }
  });

  it('expo-video 플러그인은 백그라운드 재생과 PiP를 끈다', () => {
    const videoPlugin = plugins.find((p) => Array.isArray(p) && p[0] === 'expo-video') as [string, Record<string, unknown>];
    expect(videoPlugin[1]).toEqual({ supportsBackgroundPlayback: false, supportsPictureInPicture: false });
  });
});
