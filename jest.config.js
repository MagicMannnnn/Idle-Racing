export default {
  preset: 'jest-expo',
  testEnvironment: 'node',

  extensionsToTreatAsEsm: ['.ts', '.tsx'],

  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['babel-preset-expo'] }],
  },

  // ✅ IMPORTANT: allow Expo/RN packages (including expo-modules-core) to be transformed
  transformIgnorePatterns: [
    'node_modules/(?!(jest-expo|expo(nent)?|expo-modules-core|@expo(nent)?|@react-native|react-native|@react-navigation)/)',
  ],

  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)', '**/?(*.)+(spec|test).(ts|tsx|js)'],

  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],

  moduleNameMapper: {
    '^@app/(.*)$': '<rootDir>/src/app/$1',
    '^@components/(.*)$': '<rootDir>/src/components/$1',
    '^@state/(.*)$': '<rootDir>/src/state/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^@hooks/(.*)$': '<rootDir>/src/hooks/$1',
  },
}
