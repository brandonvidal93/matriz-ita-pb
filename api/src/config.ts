import { resolve } from 'node:path';

/** Configuración leída de variables de entorno (ver `.env.example`). */
export interface Config {
  puerto: number;
  host: string;
  dbUrl: string;
  /** Carpeta del build de Angular que se sirve como sitio estático; null = no servirlo. */
  webDir: string | null;
  cookieSegura: boolean;
  /** Duración de la sesión sin actividad, en minutos. */
  sesionMinutos: number;
  /** Orígenes aceptados en peticiones que modifican datos (además del propio host). */
  origenes: string[];
  confiarProxy: boolean;
  /** Swagger en /api/docs. Solo fuera de producción. */
  docs: boolean;
}

export function leerConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const prod = env['NODE_ENV'] === 'production';
  const dbUrl = env['ITA_DB_URL'];
  if (!dbUrl) throw new Error('Falta ITA_DB_URL (p. ej. mysql://usuario:clave@localhost:3306/matriz_ita).');
  const web = env['ITA_WEB_DIR'] ?? resolve(import.meta.dirname, '../../dist/matriz-ita-pb/browser');
  return {
    puerto: Number(env['ITA_PUERTO'] ?? 3000),
    host: env['ITA_HOST'] ?? '0.0.0.0',
    dbUrl,
    webDir: web === '' ? null : web,
    cookieSegura: env['ITA_COOKIE_SEGURA'] ? env['ITA_COOKIE_SEGURA'] === 'true' : prod,
    sesionMinutos: Number(env['ITA_SESION_MINUTOS'] ?? 480),
    origenes: (env['ITA_ORIGENES'] ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    confiarProxy: env['ITA_CONFIAR_PROXY'] === 'true',
    docs: !prod && env['ITA_DOCS'] === 'true',
  };
}
