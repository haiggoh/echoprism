// ESLint config — added 2026-10-31 (waypoint echoprism-npm-run-lint-cannot):
// package.json shipped "lint": "eslint . --ext ts,tsx ..." plus the plugins,
// but no config file existed, so the gate never once ran (npx eslint exited 2).
//
// Shape (per the waypoint's own guidance): mirror what tsc already enforces
// (strict, noUnusedLocals, noUnusedParameters are in tsconfig.json) plus the
// react-hooks rules that are the whole point of the plugin. eslint:recommended
// + @typescript-eslint/recommended add the baseline; pre-existing findings
// were triaged 2026-10-31 — see git log for the fixes, and the rule comments
// below for anything deliberately left off.
//
// .cjs because package.json has "type": "module"; the lint script's --ext
// flag means the eslintrc format (ESLint 8.57 default), not flat config.
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['node_modules/', 'dist/', 'src-tauri/', 'coverage/'],
  rules: {
    // tsc already enforces these (tsconfig noUnusedLocals/noUnusedParameters);
    // keep the eslint copy aligned, with the same _-prefix escape hatch.
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    // The repo mixes component and non-component exports in screen/hook
    // files by design (one implementation per surface); the rule would force
    // splitting files for no behavioural gain.
    'react-refresh/only-export-components': 'off',
    // Test files legitimately use `any` for mock spies and jsdom shims.
    // (Overridden per-file below rather than globally.)
  },
  overrides: [
    {
      files: ['**/__tests__/**/*.{ts,tsx}', 'e2e/**/*.ts', 'src/mocks/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
      },
    },
  ],
};
