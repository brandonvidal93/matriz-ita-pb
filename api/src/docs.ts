import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { COOKIE_SESION } from './auth';
import {
  CambioClave, CambioEvidencia, CambioRegistro, CambioRespuestas, CambioUsuario, Credenciales, EvidenciaEntrada, Filas,
  NuevoRegistro, NuevoUsuario, Respaldo,
} from './esquemas';

/** Documentación OpenAPI solo para desarrollo (ITA_DOCS=true). Las rutas siguen validando con zod. */

const json = (s: z.ZodType) => z.toJSONSchema(s, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' });
const id = { type: 'string', description: 'Identificador del registro' };
const evId = { type: 'string', description: 'Identificador de la evidencia' };
const conId = { type: 'object', properties: { id }, required: ['id'] };
const conEv = { type: 'object', properties: { id, evId }, required: ['id', 'evId'] };

type Doc = { tags: string[]; summary: string; publica?: boolean; body?: z.ZodType; params?: object; querystring?: object };

const RUTAS: Record<string, Doc> = {
  'GET /api/salud': { tags: ['sistema'], summary: 'Estado del servidor y la base', publica: true },

  'POST /api/auth/ingresar': { tags: ['auth'], summary: 'Inicia sesión y deja la cookie de sesión', publica: true, body: Credenciales },
  'POST /api/auth/salir': { tags: ['auth'], summary: 'Cierra la sesión actual', publica: true },
  'GET /api/auth/yo': { tags: ['auth'], summary: 'Usuario de la sesión' },
  'POST /api/auth/clave': { tags: ['auth'], summary: 'Cambia la contraseña propia', body: CambioClave },

  'GET /api/usuarios': { tags: ['usuarios'], summary: 'Lista usuarios (admin)' },
  'POST /api/usuarios': { tags: ['usuarios'], summary: 'Crea un usuario (admin)', body: NuevoUsuario },
  'PATCH /api/usuarios/:id': {
    tags: ['usuarios'], summary: 'Modifica un usuario (admin)', body: CambioUsuario,
    params: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'] },
  },

  'GET /api/registros': { tags: ['registros'], summary: 'Lista registros' },
  'POST /api/registros': { tags: ['registros'], summary: 'Crea un registro (editor)', body: NuevoRegistro },
  'GET /api/registros/:id': { tags: ['registros'], summary: 'Registro completo', params: conId },
  'PATCH /api/registros/:id': { tags: ['registros'], summary: 'Modifica datos del registro (editor)', params: conId, body: CambioRegistro },
  'DELETE /api/registros/:id': { tags: ['registros'], summary: 'Elimina un registro (admin)', params: conId },
  'PATCH /api/registros/:id/respuestas': { tags: ['registros'], summary: 'Cambia respuestas por fila (editor)', params: conId, body: CambioRespuestas },
  'GET /api/registros/:id/historial': {
    tags: ['registros'], summary: 'Historial de cambios (admin)', params: conId,
    querystring: { type: 'object', properties: { limite: { type: 'integer', minimum: 1, maximum: 1000, default: 200 } } },
  },

  'POST /api/registros/:id/evidencias': { tags: ['evidencias'], summary: 'Agrega una evidencia (editor)', params: conId, body: EvidenciaEntrada },
  'PATCH /api/registros/:id/evidencias/:evId': { tags: ['evidencias'], summary: 'Modifica una evidencia (editor)', params: conEv, body: CambioEvidencia },
  'DELETE /api/registros/:id/evidencias/:evId': { tags: ['evidencias'], summary: 'Elimina una evidencia (editor)', params: conEv },
  'POST /api/registros/:id/evidencias/:evId/asignar': { tags: ['evidencias'], summary: 'Asigna la evidencia a filas (editor)', params: conEv, body: Filas },
  'POST /api/registros/:id/evidencias/:evId/quitar': { tags: ['evidencias'], summary: 'Quita la evidencia de filas (editor)', params: conEv, body: Filas },

  'GET /api/respaldo': { tags: ['respaldo'], summary: 'Descarga todos los registros en .json' },
  'POST /api/respaldo': { tags: ['respaldo'], summary: 'Restaura un respaldo (admin)', body: Respaldo },
};

/** Se registra antes de las rutas: el hook onRoute solo ve las rutas declaradas después. */
export async function registrarDocs(app: FastifyInstance) {
  // Import dinámico: los paquetes son de desarrollo y no existen en producción.
  const [{ default: swagger }, { default: swaggerUi }] = await Promise.all([import('@fastify/swagger'), import('@fastify/swagger-ui')]);

  // Los esquemas son solo descriptivos: la validación la hace zod en cada ruta, igual que en producción.
  app.setValidatorCompiler(() => () => true);

  app.addHook('onRoute', (ruta) => {
    for (const metodo of [ruta.method].flat()) {
      const doc = RUTAS[`${metodo} ${ruta.url}`];
      if (!doc) continue;
      ruta.schema = {
        ...ruta.schema,
        tags: doc.tags,
        summary: doc.summary,
        ...(doc.publica ? {} : { security: [{ sesion: [] }] }),
        ...(doc.body && { body: json(doc.body) }),
        ...(doc.params && { params: doc.params }),
        ...(doc.querystring && { querystring: doc.querystring }),
      };
    }
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'API Matriz ITA',
        version: '1.0.0',
        description:
          'Solo desarrollo. Para probar rutas protegidas, ejecute primero `POST /api/auth/ingresar`: ' +
          'el navegador guarda la cookie de sesión y la envía en las siguientes peticiones.',
      },
      components: { securitySchemes: { sesion: { type: 'apiKey', in: 'cookie', name: COOKIE_SESION } } },
    },
    // Solo las rutas de la API, sin la propia documentación.
    transform: ({ schema, url }) => ({ schema: { ...schema, hide: !url.startsWith('/api/') || url.startsWith('/api/docs') }, url }),
  });
  await app.register(swaggerUi, { routePrefix: '/api/docs' });
}
