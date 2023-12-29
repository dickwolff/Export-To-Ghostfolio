import type { Config } from '@jest/types';

// Sync object
const config: Config.InitialOptions = {
  verbose: true,
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  collectCoverageFrom: ['src/**/*.ts'],
  coverageReporters: ['text-summary', 'cobertura']
};

export default config;
