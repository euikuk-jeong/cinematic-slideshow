// 테스트 전용 헬퍼: 화면의 루트 View에서 배너 광고(`AppBannerAd`, testID="banner-ad")가
// 마지막 자식으로 붙어 있는지 확인한다. 기존 화면들(앨범 목록·앨범 설정·사진 선택)이
// 공유하는 "배너는 화면 맨 아래" 배치를 새 화면이 그대로 따르는지 고정하는 데 쓴다.
interface HostNodeJson {
  props?: { testID?: string };
  children?: ReadonlyArray<HostNodeJson | string> | null;
}

export const BANNER_TEST_ID = 'banner-ad';

export function isBannerLastChildOfRoot(json: HostNodeJson | HostNodeJson[] | null): boolean {
  const root = Array.isArray(json) ? json[json.length - 1] : json;
  const children = root?.children;
  if (!children || children.length === 0) return false;
  const last = children[children.length - 1];
  return typeof last !== 'string' && last.props?.testID === BANNER_TEST_ID;
}
