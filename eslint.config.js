import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
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

export default [
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/qa/**'],
    languageOptions: {
      parser: tsParser,
      // projectService is needed for the type-aware async rules.
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: {
      'react-hooks': reactHooks,
      'ds-local': commentLengthPlugin,
      '@typescript-eslint': tsPlugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      complexity: ['error', 10],
      'max-lines': ['error', { max: 1000, skipBlankLines: true, skipComments: true }],
      // exhaustive-deps stays off: many dependency omissions are intentional.
      'react-hooks/rules-of-hooks': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-debugger': 'error',
      'no-throw-literal': 'error',
      'no-duplicate-imports': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-constant-binary-expression': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-async-promise-executor': 'error',
      'no-dupe-else-if': 'error',
      'no-cond-assign': ['error', 'always'],
      '@typescript-eslint/no-floating-promises': 'error',
      // attributes: false allows async JSX handlers but still catches dropped promises elsewhere.
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      'ds-local/comment-length': 'error',
    },
  },
  {
    // Tests and the QA harness get only the bug catchers, without size or type-aware rules.
    files: ['src/test/**/*.{ts,tsx}', 'src/**/*.test.{ts,tsx}', 'src/qa/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
    },
    rules: {
      'no-var': 'error',
      'prefer-const': 'error',
      'eqeqeq': ['error', 'smart'],
      'no-debugger': 'error',
      'no-throw-literal': 'error',
      'no-duplicate-imports': 'error',
      'no-self-assign': 'error',
      'no-unreachable': 'error',
      'no-fallthrough': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-constant-binary-expression': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      'no-async-promise-executor': 'error',
      'no-dupe-else-if': 'error',
      'no-cond-assign': ['error', 'always'],
    },
  },
];
