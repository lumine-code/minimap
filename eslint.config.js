const js = require("@eslint/js");
const n = require("eslint-plugin-n");
const globals = require("globals");
const prettier = require("eslint-config-prettier");

// Modules provided by the Lumine/Electron runtime rather than this package's own
// manifest, so they aren't resolvable by eslint-plugin-n.
const runtimeModules = ["lumine"];

module.exports = [
  js.configs.recommended,
  n.configs["flat/recommended"],
  {
    settings: {
      // This runs inside the editor's bundled Node 24 runtime, so lint
      // syntax/builtins against that rather than the package's `engines`.
      n: { version: ">=24.0.0" },
    },
    languageOptions: {
      ecmaVersion: "latest",
      // The `lib/` sources carry the `/** @babel */ ` pragma and are transpiled
      // from ESM by the editor's compile cache.
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        lumine: "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["error", { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      // localStorage is used through `window.localStorage`, i.e. the browser API
      // of the Electron renderer, not the experimental Node builtin.
      "n/no-unsupported-features/node-builtins": ["error", { ignores: ["localStorage"] }],
      "n/no-missing-import": ["error", { allowModules: runtimeModules }],
      "n/no-unpublished-import": ["error", { allowModules: runtimeModules }],
      "n/no-extraneous-import": ["error", { allowModules: runtimeModules }],
      "n/no-missing-require": ["error", { allowModules: runtimeModules }],
      "n/no-unpublished-require": ["error", { allowModules: runtimeModules }],
      "n/no-extraneous-require": ["error", { allowModules: runtimeModules }],
    },
  },
  {
    // The lint and formatting configuration are dev tooling, loaded as CommonJS;
    // the lint configuration itself requires devDependencies and never ships.
    files: ["eslint.config.js", "prettier.config.js"],
    languageOptions: { sourceType: "commonjs" },
    rules: {
      "n/no-unpublished-require": "off",
      "n/no-extraneous-require": "off",
    },
  },
  {
    // Jasmine specs run in the editor's test runner with its fake-clock helper.
    files: ["spec/**", "**/*-spec.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: { ...globals.jasmine, advanceClock: "readonly" },
    },
    rules: {
      "n/no-missing-require": "off",
      "n/no-unpublished-require": "off",
      "n/no-extraneous-require": "off",
    },
  },
  // Must be last: turns off any lint rules that would conflict with Prettier.
  prettier,
];
