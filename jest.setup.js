require('react-native-gesture-handler/jestSetup');

// react-native-worklets' own IS_JEST check (platformChecker.native.ts) is hardcoded false for
// the native platform variant that jest-expo resolves, so its real native-module init code runs
// and throws in Jest unless mocked explicitly here (no compiled root-level mock ships, only src/).
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
