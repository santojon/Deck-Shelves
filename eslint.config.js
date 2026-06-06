import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

// Existing violations at rule-enablement time are baselined in
// `eslint-suppressions.json` (committed). New violations in any file
// (including files with suppressed entries) fail the lint. Run
// `pnpm run lint:js:prune` after refactoring to clear stale entries.
export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/qa/**'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    plugins: {
      'react-hooks': reactHooks,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    // Rules picked for high bug-catching value with low false-positive
    // friction. Stylistic-only rules (formatting, line length, naming)
    // are intentionally NOT added — they generate churn without catching
    // bugs and the project has no formatter yet.
    rules: {
      complexity: ['error', 10],
      // Code-file size cap. Above 1000 lines a module almost certainly
      // owns too many responsibilities — split into focused submodules.
      // Counts code lines only (blank + comment lines ignored).
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
      // React: hook-order safety (calls of hooks in conditionals / loops
      // / nested functions). `exhaustive-deps` is intentionally NOT
      // enabled — the project has many intentional dep omissions where
      // the rule is too noisy without a separate review pass.
      'react-hooks/rules-of-hooks': 'error',
      // Modern JS: `var` is forbidden, `let` that's never reassigned
      // should be `const`. Both auto-fixable.
      'no-var': 'error',
      'prefer-const': 'error',
      // Bug catchers: strict equality (with `'smart'` to keep `==
      // null` shorthand), no `debugger`, throw real Errors, no
      // duplicated imports, no self-assignment, no unreachable code.
      'eqeqeq': ['error', 'smart'],
      'no-debugger': 'error',
      'no-throw-literal': 'error',
      'no-duplicate-imports': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      // switch case must end with break/return — fallthroughs are a
      // common source of silent bugs.
      'no-fallthrough': 'error',
    },
  },
];
