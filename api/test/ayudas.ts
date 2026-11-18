import type { FastifyInstance } from 'fastify';
import type { Pool } from 'mysql2/promise';
import { construirApp } from '../src/app';
import { hashClave } from '../src/auth';
import { leerConfig } from '../src/config';
import { crearPool, migrar } from '../src/db';

export const URL_TEST = process.env['ITA_DB_TEST_URL'];
export const CLAVE = 'clave-de-prueba-2026';

/** Las pruebas de integración se omiten (con aviso) si no hay base de pruebas. */
export const conBase = URL_TEST ? describe : describe.skip;
if (!URL_TEST) console.warn('⚠ ITA_DB_TEST_URL no está definida: se omiten las pruebas de integración con MySQL.');

export interface Entorno {
  app: FastifyInstance;
  db: Pool;
  /** Cookies de sesión por rol. */
  cookies: Record<'admin' | 'editor' | 'lector', string>;
  cerrar(): Promise<void>;
}

/** Vacía la base de pruebas, aplica migraciones, crea un usuario por rol e inicia sesión con cada uno. */
export async function prepararEntorno(): Promise<Entorno> {
  if (!URL_TEST?.includes('test')) throw new Error('Por seguridad, ITA_DB_TEST_URL debe apuntar a una base cuyo nombre contenga "test".');
  const db = crearPool(URL_TEST);
  const [tablas] = await db.query<any[]>('SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()');
  await db.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const { t } of tablas) await db.query(`DROP TABLE \`${t}\``);
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
  await migrar(db);

  const hash = await hashClave(CLAVE);
  for (const rol of ['admin', 'editor', 'lector'])
    await db.query('INSERT INTO usuarios (usuario, nombre, rol, clave_hash, debe_cambiar_clave) VALUES (?, ?, ?, ?, 0)', [
      rol, `Usuario ${rol}`, rol, hash,
    ]);
  await db.query("INSERT INTO usuario_formatos SELECT id, 'ita', IF(rol = 'lector', 'ver', 'editar') FROM usuarios WHERE rol <> 'admin'");

  const config = { ...leerConfig({ ITA_DB_URL: URL_TEST, ITA_WEB_DIR: '' }), cookieSegura: false };
  const app = await construirApp({ db, config });
  const cookies = {} as Entorno['cookies'];
  for (const rol of ['admin', 'editor', 'lector'] as const) cookies[rol] = await ingresar(app, rol);
  return {
    app,
    db,
    cookies,
    async cerrar() {
      await app.close();
      await db.end();
    },
  };
}

export async function ingresar(app: FastifyInstance, usuario: string, clave = CLAVE): Promise<string> {
  const r = await app.inject({ method: 'POST', url: '/api/auth/ingresar', payload: { usuario, clave } });
  if (r.statusCode !== 200) throw new Error(`No se pudo ingresar como ${usuario}: ${r.body}`);
  const c = r.cookies.find((x) => x.name === 'ita_sesion')!;
  return `ita_sesion=${c.value}`;
}
