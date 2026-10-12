// app.json이 정적 베이스, 이 파일은 EAS 빌드 프로필별로 달라지는 값만 덮어쓴다
// (eas.json의 preview 프로필이 APP_VARIANT=preview 환경변수를 주입). preview 빌드만
// 패키지명에 .preview 접미사를 붙여 development/production과 같은 기기에 동시 설치
// 가능하게 한다 — development/production은 기존 패키지명(com.ekjeong.cinematicslideshow,
// 배포 후 변경 불가로 확정된 값)을 그대로 유지.
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

// versionCode(Android)/buildNumber(iOS)는 따로 관리하지 않고 app.json의 version(semver)에서
// 파생한다: MAJOR*10000 + MINOR*100 + PATCH (1.1.3 → 10103). versionCode는 업로드마다 증가해야
// 하므로 Play에 올릴 빌드는 반드시 version bump가 선행돼야 한다(같은 version 재업로드는 거부됨).
function versionCodeFromVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');
  if (!match) {
    throw new Error(`app.json version must be MAJOR.MINOR.PATCH, got "${version}"`);
  }
  const [major, minor, patch] = match.slice(1).map(Number);
  if (minor > 99 || patch > 99) {
    throw new Error(`MINOR/PATCH must be <= 99 to derive versionCode, got "${version}"`);
  }
  return major * 10000 + minor * 100 + patch;
}

module.exports = ({ config }) => {
  const versionCode = versionCodeFromVersion(config.version);
  return {
    ...config,
    name: IS_PREVIEW ? `${config.name} (Preview)` : config.name,
    android: {
      ...config.android,
      package: IS_PREVIEW ? `${config.android.package}.preview` : config.android.package,
      versionCode,
    },
    ios: {
      ...config.ios,
      buildNumber: String(versionCode),
    },
  };
};

module.exports.versionCodeFromVersion = versionCodeFromVersion;
