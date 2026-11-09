import { existsSync } from 'node:fs';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { CABECERA_SESION, COOKIE_SESION, opcionesCookie, usuarioDeSesion } from './auth';
import type { Config } from './config';
import type { Db } from './db';
import { NoEncontrado } from './errores';
import { rutasAuth } from './rutas/auth';
import { rutasRegistros } from './rutas/registros';
import { rutasRespaldo } from './rutas/respaldo';
import { rutasUsuarios } from './rutas/usuarios';

export interface Contexto {
  db: Db;
  config: Config;
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function construirApp(ctx: Contexto, opciones: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const { config, db } = ctx;
  const app = Fastify({
    logger: opciones.logger ?? false,
    trustProxy: config.confiarProxy,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(rateLimit, { global: false });

  app.decorateRequest('usuario', null);

  // Cabeceras de seguridad básicas.
  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'same-origin');
  });

  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store');
    // Protección CSRF: además de la cookie SameSite=Strict, las peticiones que
    // modifican datos deben venir del mismo origen (o de uno permitido).
    if (!METODOS_SEGUROS.has(req.method)) {
      const origen = req.headers.origin;
      if (origen) {
        const propio = `${req.protocol}://${req.host}`;
        if (origen !== propio && !config.origenes.includes(origen))
          return reply.code(403).send({ error: 'Origen no permitido.' });
      }
    }
    const token = req.cookies[COOKIE_SESION];
    if (token) req.usuario = await usuarioDeSesion(db, token, config.sesionMinutos);
    if (token && req.usuario) {
      // La sesión es deslizante en el servidor: la cookie debe durar lo mismo o vencería contando desde el ingreso.
      reply.setCookie(COOKIE_SESION, token, opcionesCookie(config));
      reply.header(CABECERA_SESION, config.sesionMinutos);
    }
  });

  app.setErrorHandler((err: any, req, reply) => {
    if (err instanceof ZodError)
      return reply.code(400).send({
        error: 'Datos inválidos: ' + err.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`).join('; '),
      });
    if (err instanceof NoEncontrado) return reply.code(404).send({ error: err.message });
    if (err.statusCode && err.statusCode < 500) return reply.code(err.statusCode).send({ error: err.message });
    req.log.error(err);
    return reply.code(500).send({ error: 'Error interno del servidor.' });
  });

  app.get('/api/salud', async () => {
    await db.query('SELECT 1');
    return { ok: true };
  });

  await rutasAuth(app, ctx);
  await rutasUsuarios(app, ctx);
  await rutasRegistros(app, ctx);
  await rutasRespaldo(app, ctx);

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Ruta no encontrada.' });
    return reply.code(404).send('No encontrado');
  });

  // Sitio Angular compilado (usa rutas con #, así que basta servir los archivos).
  if (config.webDir && existsSync(config.webDir)) {
    await app.register(fastifyStatic, {
      root: config.webDir,
      wildcard: true,
      setHeaders: (res, ruta) => {
        if (ruta.endsWith('index.html')) res.header('Cache-Control', 'no-cache');
      },
    });
  }
  return app;
}
