// Envoltorio dinámico sobre app.json (Expo lo lee primero y lo pasa como
// `config`). Existe SOLO para resolver google-services.json, que está
// gitignored (repo público; GitHub secret scanning avisó de la API key):
//   - En EAS Build: la file env var GOOGLE_SERVICES_JSON (subida con
//     `eas env:create --type file`) llega como RUTA al fichero materializado.
//   - En local (expo start / prebuild): no existe la env var → se usa la
//     copia local ./google-services.json (fuera de git).
// El resto de la configuración sigue viviendo en app.json; no añadir aquí
// nada que pueda ir allí.
export default ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
