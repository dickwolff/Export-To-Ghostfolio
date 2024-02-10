import type { Config } from '@jest/types';

// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  testTimeout: 15000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '/src/models',
    '/src/manual.ts',
    '/src/watcher.ts',
    '/src/converter.ts'],
  coverageReporters: ['text', 'cobertura', 'html']
};

export default config;
