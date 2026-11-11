import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql, { Pool, PoolConnection } from 'mysql2/promise';

export type Db = Pool;
export type Conexion = Pool | PoolConnection;

export function crearPool(url: string): Pool {
  return mysql.createPool({
    uri: url,
    // Todas las fechas se guardan y leen en UTC.
    timezone: 'Z',
    dateStrings: false,
    connectionLimit: 10,
    charset: 'utf8mb4',
    multipleStatements: false,
    supportBigNumbers: true,
  });
}

/** Ejecuta `fn` dentro de una transacción; hace rollback si lanza. */
export async function enTransaccion<T>(db: Pool, fn: (cx: PoolConnection) => Promise<T>): Promise<T> {
  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();
    const r = await fn(cx);
    await cx.commit();
    return r;
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
}

const DIR_MIGRACIONES = resolve(import.meta.dirname, 'migraciones');

/**
 * Aplica, en orden, los archivos `NNN_nombre.sql` que aún no estén en la
 * tabla `migraciones`. Cada archivo puede tener varias sentencias separadas
 * por `;` al final de línea.
 */
export async function migrar(db: Pool, dir = DIR_MIGRACIONES): Promise<string[]> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS migraciones (
       nombre VARCHAR(120) PRIMARY KEY,
       aplicada DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`,
  );
  const [filas] = await db.query<mysql.RowDataPacket[]>('SELECT nombre FROM migraciones');
  const hechas = new Set(filas.map((f) => f['nombre'] as string));
  const archivos = (await readdir(dir)).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const aplicadas: string[] = [];
  for (const archivo of archivos) {
    if (hechas.has(archivo)) continue;
    const sql = await readFile(resolve(dir, archivo), 'utf8');
    const sentencias = sql
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    // MySQL hace commit implícito en DDL: cada migración debe poder reintentarse.
    for (const s of sentencias) await db.query(s);
    await db.query('INSERT INTO migraciones (nombre) VALUES (?)', [archivo]);
    aplicadas.push(archivo);
  }
  return aplicadas;
}
