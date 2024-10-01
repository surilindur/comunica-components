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
  },
  {
    files: [
      'engines/**/*-browser.ts',
      'packages/**/*-browser.ts',
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
      'ts/no-var-requires': 'off',
      'ts/no-require-imports': 'off',
      'import/extensions': 'off',
    },
  },
  {
    ignores: [
      '**/*.js',
      '**/*.d.ts',
      'packages/actor-init-query/**/*.ts',
    ],
  },
]);
