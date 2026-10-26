module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|react-native-svg|react-native-url-polyfill|react-native-safe-area-context)/)',
  ],
};
