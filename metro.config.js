// metro.config.js
// Metro configuration for React Native/Expo project
// This config is compatible with Expo SDK 53 and React Native 0.79+

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.sourceExts.push('cjs'); // Add .cjs extension support
config.resolver.unstable_enablePackageExports = false; // Add .cjs extension support

module.exports = config;
