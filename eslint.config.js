import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist', 'coverage']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
  {
    // Preact's hooks follow the same rules as React's.
    files: ['src/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
  {
    // The logic layer must stay free of the browser. tsconfig.core.json already
    // enforces this at type level; this catches it in the editor too.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'navigator',
        'localStorage',
        'sessionStorage',
        'fetch',
        'XMLHttpRequest',
      ],
    },
  },
  {
    files: ['scripts/**/*.mjs', '*.config.js'],
    extends: [js.configs.recommended],
    // The screenshot script also holds functions that run inside the browser page.
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
]);
