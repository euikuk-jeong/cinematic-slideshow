// app.json이 정적 베이스, 이 파일은 EAS 빌드 프로필별로 달라지는 값만 덮어쓴다
// (eas.json의 preview 프로필이 APP_VARIANT=preview 환경변수를 주입). preview 빌드만
// 패키지명에 .preview 접미사를 붙여 development/production과 같은 기기에 동시 설치
// 가능하게 한다 — development/production은 기존 패키지명(com.ekjeong.cinematicslideshow,
// 배포 후 변경 불가로 확정된 값)을 그대로 유지.
const IS_PREVIEW = process.env.APP_VARIANT === 'preview';

module.exports = ({ config }) => ({
  ...config,
  name: IS_PREVIEW ? `${config.name} (Preview)` : config.name,
  android: {
    ...config.android,
    package: IS_PREVIEW ? `${config.android.package}.preview` : config.android.package,
  },
});
