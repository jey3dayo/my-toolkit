import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  {
    files: ['prettier.config.js', '*.config.{js,cjs,mjs}', 'eslint.config.mjs'],
    languageOptions: {
      globals: {
        module: 'writable',
        require: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        exports: 'writable',
      },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.{ts,js}'],
    plugins: {
      'simple-import-sort': simpleImportSort,
    },
    languageOptions: {
      globals: {
        chrome: 'readonly',
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        location: 'readonly',
        console: 'readonly',
        fetch: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      'simple-import-sort/imports': 'warn',
      'simple-import-sort/exports': 'warn',

      // 関数定義スタイル（2025年推奨）
      // コールバックはアロー関数を推奨（名前付き関数は例外として許可）
      'prefer-arrow-callback': ['warn', { allowNamedFunctions: true }],
      // トップレベルは関数宣言を推奨（アロー関数も許可）
      'func-style': ['warn', 'declaration', { allowArrowFunctions: true }],
      // 簡潔な記法を推奨（1行で返す場合はブレースを省略）
      'arrow-body-style': ['warn', 'as-needed'],
    },
  },
];
