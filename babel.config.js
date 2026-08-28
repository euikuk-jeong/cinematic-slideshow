// babel-preset-expo auto-detects react-native-worklets (reanimated's dependency) and injects
// its babel plugin itself — adding it again here would double-load ("Reentrant plugin") it.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
