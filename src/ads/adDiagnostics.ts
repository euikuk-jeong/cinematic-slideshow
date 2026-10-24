// preview 빌드(eas.json의 EXPO_PUBLIC_APP_VARIANT=preview)에서만 광고 오류 코드를 화면에 작게
// 보여준다 — 로그를 볼 수 없는 실기기 검증에서 광고가 비는 이유(no-fill/설정 오류 등)를 구분하려는
// 진단용이며, 배포(production)·개발(development) 빌드에는 노출되지 않는다.
export const SHOW_AD_DIAGNOSTICS = process.env.EXPO_PUBLIC_APP_VARIANT === 'preview';
