import type { Config } from '@jest/types';

const moduleFileExtensions: string[] = [ 'ts', 'js' ];

const transform: Record<string, Config.TransformerConfig> = {
  '\\.ts$': [ 'ts-jest', {
    // Enabling this can fix issues when using prereleases of typings packages
    // isolatedModules: true
  }],
};

const config: Config.InitialOptions = {
  collectCoverage: true,
  coverageProvider: 'babel',
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100,
    },
  },
  projects: [
    {
      displayName: 'engines',
      moduleFileExtensions,
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/engines/*/test/**/*-test.ts',
      ],
      transform,
      coveragePathIgnorePatterns: [
        '<rootDir>/packages/',
        'engine-default.js',
        'node_modules',
      ],
    },
    {
      displayName: 'packages',
      moduleFileExtensions,
      testEnvironment: 'node',
      testMatch: [
        '<rootDir>/packages/*/test/**/*-test.ts',
      ],
      transform,
      coveragePathIgnorePatterns: [
        '<rootDir>/engines/',
        'node_modules',
      ],
    },
  ],
};

export default config;
