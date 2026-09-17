// Flat config per https://docs.expo.dev/guides/using-eslint/ (SDK 53+).
// eslint-plugin-prettier/recommended runs Prettier as a lint rule and turns off
// the stylistic rules it would otherwise fight with.
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['dist/*', 'web-build/*', '.expo/*'],
  },
]);
