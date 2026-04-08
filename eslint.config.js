const js = require('@eslint/js');
const globals = require('globals');
const reactHooks = require('eslint-plugin-react-hooks');
const reactRefresh = require('eslint-plugin-react-refresh').default;
const tseslint = require('typescript-eslint');

module.exports = [
  {
    ignores: ['node_modules/**', 'Frontend/dist/**', 'Backend/dist/**', 'public/**'],
  },
  {
    ...js.configs.recommended,
    files: ['Frontend/src/**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        project: './Frontend/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['Frontend/src/**/*.{ts,tsx}', 'Backend/src/**/*.ts'],
  })),
  {
    files: ['Frontend/src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      ...reactRefresh.configs.vite.rules,
    },
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        project: './Frontend/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.browser,
      },
    },
  },
  {
    ...js.configs.recommended,
    files: ['Backend/src/**/*.ts'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: {
        project: './Backend/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
];
