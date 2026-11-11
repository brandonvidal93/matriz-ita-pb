import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { nuevoId } from '../../../src/app/core/modelos';
import { auditar } from '../auditoria';
import { requiere } from '../auth';
import type { Contexto } from '../app';
import { enTransaccion } from '../db';
import { Respaldo } from '../esquemas';
import { cargarRegistros, insertarRegistro } from '../repositorio';

export interface ResultadoRestauracion {
  creados: { id: string; nombre: string }[];
  omitidos: { id: string; nombre: string; motivo: string }[];
}

export async function rutasRespaldo(app: FastifyInstance, { db }: Contexto) {
  /** Todos los registros en el mismo formato del antiguo archivo de datos. */
  app.get('/api/respaldo', { preHandler: requiere() }, async (req, reply) => {
    const fecha = new Date().toISOString();
    await auditar(db, req.usuario, 'respaldo-descargado', null);
    reply.header('Content-Disposition', `attachment; filename="matriz-ita-datos_${fecha.slice(0, 10)}.json"`);
    return { app: 'matriz-ita', formato: 1, guardado: fecha, registros: await cargarRegistros(db) };
  });

  /**
   * Restaura un respaldo o migra el antiguo archivo de datos local.
   * - Si el id no existe, se crea igual.
   * - Si existe con la misma fecha de modificación, se omite (ya estaba cargado).
   * - Si existe con otra fecha, se crea como copia con un id nuevo; nunca se sobrescribe.
   */
  app.post('/api/respaldo', { preHandler: requiere('admin'), bodyLimit: 50 * 1024 * 1024 }, async (req) => {
    const { registros } = Respaldo.parse(req.body);
    const res: ResultadoRestauracion = { creados: [], omitidos: [] };
    for (const r of registros) {
      await enTransaccion(db, async (cx) => {
        const [ex] = await cx.query<RowDataPacket[]>('SELECT actualizado FROM registros WHERE id = ?', [r.id]);
        let id = r.id;
        let nombre = r.nombre;
        if (ex[0]) {
          const mismo = r.actualizado && ex[0]['actualizado'].getTime() === new Date(r.actualizado).getTime();
          if (mismo) return void res.omitidos.push({ id: r.id, nombre: r.nombre, motivo: 'Ya estaba cargado' });
          id = nuevoId();
          nombre = `${r.nombre} (restaurado)`;
        }
        await insertarRegistro(
          cx,
          { id, nombre, tipo: r.tipo, vigencia: r.vigencia, periodo: r.periodo, creado: r.creado, actualizado: r.actualizado },
          r,
          req.usuario!.id,
        );
        await auditar(cx, req.usuario, 'registro-restaurado', id, { origen: r.id, nombre });
        res.creados.push({ id, nombre });
      });
    }
    return res;
  });
}
