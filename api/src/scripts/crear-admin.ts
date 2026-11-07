/**
 * Crea (o restablece) un usuario administrador.
 *   npm run crear-admin -- <usuario> "<Nombre completo>"
 * La contraseña se pide por consola (o en ITA_ADMIN_CLAVE) y deberá cambiarse al ingresar.
 */
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { hashClave } from '../auth';
import { leerConfig } from '../config';
import { crearPool, migrar } from '../db';
import { Clave, NuevoUsuario } from '../esquemas';

const [usuario, nombre = 'Administrador'] = process.argv.slice(2);
if (!usuario) {
  console.error('Uso: npm run crear-admin -- <usuario> "<Nombre completo>"');
  process.exit(1);
}

let clave = process.env['ITA_ADMIN_CLAVE'];
if (!clave) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  clave = await rl.question('Contraseña inicial (mín. 10 caracteres, letras y números): ');
  rl.close();
}
const v = Clave.safeParse(clave);
if (!v.success) {
  console.error(v.error.issues[0]!.message);
  process.exit(1);
}
const d = NuevoUsuario.parse({ usuario, nombre, rol: 'admin', clave });

const db = crearPool(leerConfig().dbUrl);
await migrar(db, resolve(import.meta.dirname, '../migraciones'));
await db.query(
  `INSERT INTO usuarios (usuario, nombre, rol, clave_hash, debe_cambiar_clave, activo) VALUES (?, ?, 'admin', ?, 1, 1)
   ON DUPLICATE KEY UPDATE rol = 'admin', clave_hash = VALUES(clave_hash), debe_cambiar_clave = 1, activo = 1`,
  [d.usuario, d.nombre, await hashClave(d.clave)],
);
console.log(`Administrador “${d.usuario}” listo. Deberá cambiar la contraseña al ingresar.`);
await db.end();
