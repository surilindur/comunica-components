const config = require('@rubensworks/eslint-config');

module.exports = config([
  {
    files: [ '**/*.ts' ],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: [ './tsconfig.eslint.json' ],
      },
    },
    rules: {
      'ts/naming-convention': 'off',
    },
  },
  {
    files: [
      'engines/*/lib/index-browser.ts',
    ],
    rules: {
      'unicorn/filename-case': 'off',
    },
  },
  {
    files: [
      'engines/*/bin/http.ts',
      'engines/*/bin/query-dynamic.ts',
      'engines/*/lib/QueryEngineFactory.ts',
    ],
    rules: {
      'import/no-nodejs-modules': 'off',
    },
  },
  {
    files: [
      'engines/*/bin/query.ts',
      'engines/*/lib/QueryEngine.ts',
    ],
    rules: {
      'import/extensions': 'off',
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
    },
  },
  {
    ignores: [
      'packages/actor-rdf-metadata-extract-void',
      'packages/types',
      'packages/types-link-traversal',
      'packages/utils-query-operation',
    ],
  },
]);
