// ESLint (decisions.md 95): the usual JavaScript and TypeScript checks and React's rules of hooks.
// `npm run lint` must pass in CI; rules that would need many rewrites start as warnings.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'dist-apps', 'dist-preview', 'coverage', 'node_modules', 'public', 'reference', 'src/bijoy/vendor', 'test-results', 'playwright-report', 'pw.local.config.ts', '**/*.d.mts', '**/*.d.ts'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none', destructuredArrayIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Bangla text work: no-break spaces, joiners and vowel signs inside character classes, and \x00
      // markers are on purpose (Bijoy conversion, typing engine, exports)
      'no-irregular-whitespace': 'off',
      'no-misleading-character-class': 'off',
      'no-control-regex': 'off',
    },
  },
  { files: ['tools/**/*.{js,mjs}', '*.config.{js,ts,mjs}', 'vite.*.mjs'], languageOptions: { globals: { ...globals.node } } },
  // the golden recorder runs most of its code inside the reference page (Chromium), where v8's globals live
  { files: ['tools/gen-golden.mjs'], languageOptions: { globals: { ...globals.browser, LEX_BN_LEGAL: 'readonly', LEX_BN_COMMON: 'readonly', SEED_PHRASES: 'readonly' } } },
  { files: ['tests/**/*.{ts,tsx}'], rules: { '@typescript-eslint/no-non-null-assertion': 'off' } },
);
