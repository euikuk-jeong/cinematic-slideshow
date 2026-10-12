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
