const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Expo aplica tree shaking en producción. Con inlineRequires, los
// módulos del árbol autenticado no se evalúan durante el arranque que termina
// en Login; se inicializan cuando su pantalla se usa por primera vez.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: true,
    inlineRequires: true,
  },
});

module.exports = config;
