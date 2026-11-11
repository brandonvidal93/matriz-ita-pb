import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { auditar } from '../auditoria';
import {
  CABECERA_SESION, COOKIE_SESION, cerrarSesion, cerrarSesionesDe, crearSesion, hashClave, opcionesCookie, requiere, verificarCredenciales,
} from '../auth';
import type { Contexto } from '../app';
import { CambioClave, Credenciales } from '../esquemas';

export async function rutasAuth(app: FastifyInstance, { db, config }: Contexto) {
  app.post(
    '/api/auth/ingresar',
    { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } },
    async (req, reply) => {
      const { usuario, clave } = Credenciales.parse(req.body);
      const u = await verificarCredenciales(db, usuario, clave);
      if (!u) {
        await auditar(db, null, 'ingreso-fallido', null, { usuario, ip: req.ip });
        return reply.code(401).send({ error: 'Usuario o contraseña incorrectos.' });
      }
      const token = await crearSesion(db, u.id, config.sesionMinutos);
      await db.query('UPDATE usuarios SET ultimo_ingreso = ? WHERE id = ?', [new Date(), u.id]);
      await auditar(db, u, 'ingreso', null, { ip: req.ip });
      reply.setCookie(COOKIE_SESION, token, opcionesCookie(config));
      reply.header(CABECERA_SESION, config.sesionMinutos);
      return u;
    },
  );

  app.post('/api/auth/salir', async (req, reply) => {
    const token = req.cookies[COOKIE_SESION];
    if (token) await cerrarSesion(db, token);
    reply.clearCookie(COOKIE_SESION, { path: '/' });
    return { ok: true };
  });

  app.get('/api/auth/yo', { preHandler: requiere() }, async (req) => req.usuario);

  app.post('/api/auth/clave', { preHandler: requiere(), config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (req, reply) => {
    const { actual, nueva } = CambioClave.parse(req.body);
    const u = req.usuario!;
    const [filas] = await db.query<RowDataPacket[]>('SELECT clave_hash FROM usuarios WHERE id = ?', [u.id]);
    if (!filas[0] || !(await bcrypt.compare(actual, filas[0]['clave_hash'])))
      return reply.code(400).send({ error: 'La contraseña actual no es correcta.' });
    if (actual === nueva) return reply.code(400).send({ error: 'La nueva contraseña debe ser distinta de la actual.' });
    await db.query('UPDATE usuarios SET clave_hash = ?, debe_cambiar_clave = 0 WHERE id = ?', [await hashClave(nueva), u.id]);
    // Cierra las demás sesiones abiertas del usuario.
    await cerrarSesionesDe(db, u.id, req.cookies[COOKIE_SESION]);
    await auditar(db, u, 'cambio-clave', null);
    return { ...u, debeCambiarClave: false };
  });
}
