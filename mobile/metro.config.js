const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    blockList: [
      /[/\\]\.bundle[/\\].*/,
      /[/\\]android[/\\](?:\.gradle|\.cxx|build|app[/\\](?:build|\.cxx))[/\\].*/,
      /[/\\]ios[/\\](?:Pods|build)[/\\].*/,
    ],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
