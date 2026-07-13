// Minimal, syntax-only ESLint flat config used ONLY to measure cyclomatic
// complexity for the CI reports (see complexity-metric.mjs). It deliberately
// avoids the project's type-aware config (`projectService`) so it runs fast and
// works against ANY src/ tree — including a historical one archived from a git
// tag during backfill. The `complexity` threshold matches the real config (10)
// so a "violation" here is exactly a violation there.
import tsParser from '@typescript-eslint/parser';

export default [
  // Match the real config's ignore set so the count lines up with the
  // eslint-suppressions complexity total (tests + QA harness excluded).
  { ignores: ['**/test/**', '**/*.test.{ts,tsx}', '**/qa/**'] },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: {
      // `warn` (not error) so eslint exits 0 and we parse the JSON output.
      complexity: ['warn', 10],
    },
  },
];
