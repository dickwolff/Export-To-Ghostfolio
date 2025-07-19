import type { Config } from "@jest/types";

// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  testTimeout: 5000,
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts'],
  coveragePathIgnorePatterns: [
    '/src/models',
    '/src/manual.ts',
    '/src/watcher.ts',
  ],
  coverageReporters: ['text', 'cobertura', 'html'],
  setupFiles: ["<rootDir>/src/testing/testEnvVars.js"]
};

export default config;
