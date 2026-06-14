import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

const MAX_LINE_COMMENT_LINES = 3;
const MAX_BLOCK_COMMENT_LINES = 5;

const commentLengthPlugin = {
  rules: {
    'comment-length': {
      meta: {
        type: 'suggestion',
        docs: { description: 'Limit consecutive // comments and /* */ block comments.' },
        messages: {
          tooManyLines: 'Consecutive `//` comments capped at {{max}} lines (saw {{actual}}). Trim or rewrite as a {{max_block}}-line block.',
          tooLongBlock: '`/* */` block comment capped at {{max}} lines (saw {{actual}}). Trim or split.',
        },
        schema: [],
      },
      create(context) {
        const sc = context.sourceCode;
        function reportGroup(group) {
          if (group.length <= MAX_LINE_COMMENT_LINES) return;
          context.report({
            node: group[0],
            loc: { start: group[0].loc.start, end: group[group.length - 1].loc.end },
            messageId: 'tooManyLines',
            data: { max: MAX_LINE_COMMENT_LINES, actual: group.length, max_block: MAX_BLOCK_COMMENT_LINES },
          });
        }
        return {
          Program() {
            const comments = sc.getAllComments();
            let group = [];
            for (const c of comments) {
              if (c.type === 'Line') {
                if (group.length && group[group.length - 1].loc.end.line + 1 === c.loc.start.line) {
                  group.push(c);
                } else {
                  reportGroup(group);
                  group = [c];
                }
              } else if (c.type === 'Block') {
                reportGroup(group);
                group = [];
                const lines = (c.value.match(/\n/g) || []).length + 1;
                if (lines > MAX_BLOCK_COMMENT_LINES) {
                  context.report({
                    node: c,
                    messageId: 'tooLongBlock',
                    data: { max: MAX_BLOCK_COMMENT_LINES, actual: lines },
                  });
                }
              }
            }
            reportGroup(group);
          },
        };
      },
    },
  },
};

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
      'ds-local': commentLengthPlugin,
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
      // Consecutive `//` comments capped at 3 lines; `/* */` blocks at 5
      // lines. Long-form notes belong in docs/.
      'ds-local/comment-length': 'warn',
    },
  },
];
