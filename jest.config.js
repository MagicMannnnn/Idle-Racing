export default {
  preset: 'jest-expo',

  testEnvironment: 'node',

  testMatch: ['**/?(*.)+(spec|test).(ts|tsx|js)'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],

  transformIgnorePatterns: ['node_modules/(?!(jest-expo|expo|@expo|react-native|@react-native)/)'],

  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
  },
}
