const { defineConfig, globalIgnores } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  globalIgnores([
    'android/**',
    'dist/**',
    'ios/**',
    'node_modules/**',
    'scripts/**',
    'supabase/functions/**',
  ]),
  expoConfig,
  {
    rules: {
      // Expo SDK 57 enables React Compiler-oriented lint rules. The app is not
      // opting into the compiler in this migration; keep the established
      // imperative animation/loading patterns until they can be migrated in a
      // dedicated, behavior-tested refactor.
      'react-hooks/globals': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/use-memo': 'off',
      // React Native carga assets con require(). Estos tres módulos se cargan
      // además de forma deliberadamente perezosa para conservar compatibilidad
      // con Expo Go/builds antiguos o para romper el ciclo entre modales.
      '@typescript-eslint/no-require-imports': ['warn', {
        allow: [
          '^\\.',
          '^expo-glass-effect$',
          '^expo-secure-store$',
          '^react-native-purchases$',
        ],
      }],
    },
  },
]);
