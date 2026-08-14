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
