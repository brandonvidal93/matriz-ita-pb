import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import type { Rol, Usuario } from '../../src/app/core/modelos';
import type { Conexion } from './db';

export const COOKIE_SESION = 'ita_sesion';
const COSTO_BCRYPT = 12;
// Hash de relleno para que un usuario inexistente tarde lo mismo que uno real.
const HASH_FALSO = bcrypt.hashSync('clave-de-relleno-no-valida', COSTO_BCRYPT);

export const hashClave = (clave: string) => bcrypt.hash(clave, COSTO_BCRYPT);

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export function usuarioDesdeFila(f: RowDataPacket): Usuario {
  return {
    id: f['id'],
    usuario: f['usuario'],
    nombre: f['nombre'],
    rol: f['rol'],
    activo: !!f['activo'],
    debeCambiarClave: !!f['debe_cambiar_clave'],
  };
}

/** Valida usuario y contraseña. Devuelve null si no coinciden o el usuario está inactivo. */
export async function verificarCredenciales(cx: Conexion, usuario: string, clave: string): Promise<Usuario | null> {
  const [filas] = await cx.query<RowDataPacket[]>('SELECT * FROM usuarios WHERE usuario = ?', [usuario.trim().toLowerCase()]);
  const f = filas[0];
  const ok = await bcrypt.compare(clave, f ? f['clave_hash'] : HASH_FALSO);
  if (!f || !ok || !f['activo']) return null;
  return usuarioDesdeFila(f);
}

export async function crearSesion(cx: Conexion, usuarioId: number, minutos: number): Promise<string> {
  const token = randomBytes(32).toString('base64url');
  await cx.query('INSERT INTO sesiones (id, usuario_id, expira) VALUES (?, ?, ?)', [
    hashToken(token),
    usuarioId,
    new Date(Date.now() + minutos * 60_000),
  ]);
  // Limpieza oportunista de sesiones vencidas.
  await cx.query('DELETE FROM sesiones WHERE expira < ?', [new Date()]);
  return token;
}

/** Devuelve el usuario de una sesión vigente y extiende su vencimiento (sesión deslizante). */
export async function usuarioDeSesion(cx: Conexion, token: string, minutos: number): Promise<Usuario | null> {
  const id = hashToken(token);
  const [filas] = await cx.query<RowDataPacket[]>(
    `SELECT u.* FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
     WHERE s.id = ? AND s.expira > ? AND u.activo = 1`,
    [id, new Date()],
  );
  if (!filas[0]) return null;
  await cx.query('UPDATE sesiones SET expira = ? WHERE id = ?', [new Date(Date.now() + minutos * 60_000), id]);
  return usuarioDesdeFila(filas[0]);
}

export async function cerrarSesion(cx: Conexion, token: string): Promise<void> {
  await cx.query('DELETE FROM sesiones WHERE id = ?', [hashToken(token)]);
}

export async function cerrarSesionesDe(cx: Conexion, usuarioId: number, exceptoToken?: string): Promise<void> {
  if (exceptoToken) await cx.query('DELETE FROM sesiones WHERE usuario_id = ? AND id <> ?', [usuarioId, hashToken(exceptoToken)]);
  else await cx.query('DELETE FROM sesiones WHERE usuario_id = ?', [usuarioId]);
}

declare module 'fastify' {
  interface FastifyRequest {
    usuario: Usuario | null;
  }
}

/** preHandler: exige sesión y uno de los roles indicados. */
export function requiere(...roles: Rol[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.usuario) return reply.code(401).send({ error: 'Debes iniciar sesión.' });
    if (req.usuario.debeCambiarClave && !req.url.startsWith('/api/auth/'))
      return reply.code(403).send({ error: 'Debes cambiar tu contraseña antes de continuar.', codigo: 'cambiar-clave' });
    if (roles.length && !roles.includes(req.usuario.rol))
      return reply.code(403).send({ error: 'No tienes permiso para esta acción.' });
  };
}

export const EDITORES: Rol[] = ['admin', 'editor'];
