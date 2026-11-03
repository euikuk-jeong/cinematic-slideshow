// app.json이 정적 베이스, 이 파일은 EAS 빌드 프로필별로 달라지는 값만 덮어쓴다
// (eas.json의 development/preview 프로필이 APP_VARIANT 환경변수를 주입). development는 .dev,
// preview는 .preview 접미사를 패키지명에 붙여 Play에서 받은 production과 같은 기기에 동시 설치
// 가능하게 한다 — 접미사 없이 같은 패키지명이면 서명이 달라 Play 업데이트가 실패한다(2026-11-04 확인).
// production만 기존 패키지명(com.ekjeong.cinematicslideshow, 배포 후 변경 불가로 확정된 값)을 유지.
// AdMob은 dev client(__DEV__)에서 테스트 광고 ID를 쓰고 google-services 설정도 없어 패키지명 변경의 영향이 없다.
const VARIANTS = {
  development: { packageSuffix: '.dev', nameSuffix: ' (Dev)' },
  preview: { packageSuffix: '.preview', nameSuffix: ' (Preview)' },
};

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
  const variant = VARIANTS[process.env.APP_VARIANT] ?? { packageSuffix: '', nameSuffix: '' };
  return {
    ...config,
    name: `${config.name}${variant.nameSuffix}`,
    android: {
      ...config.android,
      package: `${config.android.package}${variant.packageSuffix}`,
      versionCode,
    },
    ios: {
      ...config.ios,
      buildNumber: String(versionCode),
    },
  };
};

module.exports.versionCodeFromVersion = versionCodeFromVersion;
