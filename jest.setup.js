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
}));
