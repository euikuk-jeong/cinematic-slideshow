require('react-native-gesture-handler/jestSetup');

// react-native-worklets' own IS_JEST check (platformChecker.native.ts) is hardcoded false for
// the native platform variant that jest-expo resolves, so its real native-module init code runs
// and throws in Jest unless mocked explicitly here (no compiled root-level mock ships, only src/).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

// expo-audio는 모듈을 require하는 시점에 NativeModule.AudioPlayer.prototype에 접근하는데(SDK 57),
// jest 환경엔 네이티브 모듈이 등록되어 있지 않아(다른 expo-* 패키지와 달리 automock으로 못 버팀)
// import 자체가 throw한다 — 재생 여부를 확인하는 테스트가 아니라면 이 최소 mock으로 충분하다.
jest.mock('expo-audio', () => ({
  useAudioPlaylist: jest.fn(() => ({
    id: 'mock-audio-playlist',
    currentIndex: 0,
    trackCount: 0,
    playing: false,
    play: jest.fn(),
    pause: jest.fn(),
    next: jest.fn(),
    previous: jest.fn(),
  })),
  // 실기기에서는 트랙 전환 시 currentIndex가 이벤트로 갱신되지만, 이 정적 mock은 항상 0을
  // 반환한다 — 트랙 전환에 따른 재렌더링을 검증하는 테스트는 이 mock으로 불가능하다(실기기
  // 검증 대상, doc/todo/todo.md 참고).
  useAudioPlaylistStatus: jest.fn(() => ({
    id: 'mock-audio-playlist',
    currentIndex: 0,
    trackCount: 0,
    currentTime: 0,
    duration: 0,
    playing: false,
    isBuffering: false,
  })),
}));

// react-native-google-mobile-ads도 네이티브 모듈이라 import 시점에 throw한다(expo-audio와
// 동일 사유) — 광고 노출/로드 여부를 검증하는 테스트가 아니므로 최소 mock으로 충분하다.
jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    initialize: jest.fn().mockResolvedValue(undefined),
  })),
  BannerAd: () => null,
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'ANCHORED_ADAPTIVE_BANNER' },
  TestIds: { BANNER: 'mock-test-banner-id' },
}));
