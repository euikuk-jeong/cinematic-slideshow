export type OpenSourceLicenseEntry = {
  name: string;
  version: string;
  license: string;
  homepage: string | null;
};

// Generated from package.json "dependencies" + each package's node_modules/<name>/package.json
// (name/version/license/homepage fields) as of app version 0.9.2. Re-run the same lookup and
// update this list by hand when dependencies change.
export const OPEN_SOURCE_LICENSES: OpenSourceLicenseEntry[] = [
  { name: '@react-native-community/slider', version: '5.2.0', license: 'MIT', homepage: 'https://github.com/callstack/react-native-slider#readme' },
  { name: '@react-navigation/native', version: '7.3.17', license: 'MIT', homepage: 'https://reactnavigation.org' },
  { name: '@react-navigation/native-stack', version: '7.18.9', license: 'MIT', homepage: 'https://github.com/software-mansion/react-native-screens#readme' },
  { name: 'expo', version: '57.0.15', license: 'MIT', homepage: 'https://github.com/expo/expo/tree/main/packages/expo' },
  { name: 'expo-audio', version: '57.0.4', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/audio/' },
  { name: 'expo-blur', version: '57.0.2', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/blur-view/' },
  { name: 'expo-dev-client', version: '57.0.14', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/dev-client/' },
  { name: 'expo-file-system', version: '57.0.6', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/filesystem/' },
  { name: 'expo-keep-awake', version: '57.0.1', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/keep-awake/' },
  { name: 'expo-media-library', version: '57.0.4', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/media-library/' },
  { name: 'expo-screen-orientation', version: '57.0.2', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/screen-orientation/' },
  { name: 'expo-sqlite', version: '57.0.1', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/sqlite/' },
  { name: 'expo-status-bar', version: '57.0.1', license: 'MIT', homepage: 'https://docs.expo.dev/versions/latest/sdk/status-bar/' },
  { name: 'music-metadata', version: '11.15.0', license: 'MIT', homepage: 'https://github.com/Borewit/music-metadata' },
  { name: 'react', version: '19.2.3', license: 'MIT', homepage: 'https://react.dev/' },
  { name: 'react-native', version: '0.86.2', license: 'MIT', homepage: 'https://reactnative.dev/' },
  { name: 'react-native-draggable-flatlist', version: '4.0.3', license: 'MIT', homepage: 'https://github.com/computerjazz/react-native-draggable-flatlist#readme' },
  { name: 'react-native-gesture-handler', version: '2.32.0', license: 'MIT', homepage: 'https://docs.swmansion.com/react-native-gesture-handler/' },
  { name: 'react-native-reanimated', version: '4.5.1', license: 'MIT', homepage: 'https://docs.swmansion.com/react-native-reanimated' },
  { name: 'react-native-safe-area-context', version: '5.7.0', license: 'MIT', homepage: 'https://github.com/AppAndFlow/react-native-safe-area-context#readme' },
  { name: 'react-native-screens', version: '4.26.2', license: 'MIT', homepage: 'https://github.com/software-mansion/react-native-screens#readme' },
];
