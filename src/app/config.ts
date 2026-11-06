/**
 * Configuración de la aplicación.
 *
 * googleClientId: ID de cliente OAuth 2.0 (tipo "Aplicación web") creado en
 * Google Cloud Console con la cuenta institucional. Debe tener como
 * "Orígenes autorizados de JavaScript" la URL donde se sirva el sitio
 * (p. ej. http://localhost:4200 y el dominio institucional).
 * Mientras esté vacío, la app funciona solo con almacenamiento local.
 */
export const CONFIG = {
  googleClientId: '',
  /** Carpeta que la app crea (y reutiliza) en el Drive del usuario. */
  driveCarpeta: 'Matriz ITA - Gestión TIC',
  /** Permiso mínimo: la app solo ve los archivos que ella misma crea. */
  driveScope: 'https://www.googleapis.com/auth/drive.file',
  institucion: 'Institución Universitaria Pascual Bravo',
  dependencia: 'Gestión TIC',
};
