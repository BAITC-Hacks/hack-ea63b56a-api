module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test', '<rootDir>/../tests'],
  testMatch: ['**/*.spec.ts', '**/*.spec.cjs'],
  transform: { '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['js', 'json', 'ts', 'cjs'],
};
