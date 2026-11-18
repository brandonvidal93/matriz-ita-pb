import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { nuevoId } from '../../../../src/app/core/modelos';
import { aplicarCambio, completar, contenidoVacio, type Contenido, type Evaluacion } from '../../../../src/app/formatos/accesibilidad/modelo';
import { auditar } from '../../auditoria';
import { requiere, requiereFormato } from '../../auth';
import type { Contexto } from '../../app';
import type { Conexion } from '../../db';
import { enTransaccion } from '../../db';
import { NoEncontrado } from '../../errores';
import type { ResultadoRestauracion } from '../ita/respaldo';
import { CambioEvaluacion, MAX_EVIDENCIAS, RespaldoAccesibilidad } from './esquemas';

type P = { Params: { id: string } };
const BASE = '/api/accesibilidad';

const deFila = (f: RowDataPacket): Evaluacion => ({
  ...completar(f['contenido'] as Contenido),
  id: f['id'],
  ticket: f['ticket'],
  creado: f['creado'].toISOString(),
  actualizado: f['actualizado'].toISOString(),
});

async function cargar(cx: Conexion, id?: string): Promise<Evaluacion[]> {
  const [filas] = await cx.query<RowDataPacket[]>(
    `SELECT * FROM evaluaciones_accesibilidad ${id ? 'WHERE id = ?' : ''} ORDER BY ticket DESC`,
    id ? [id] : [],
  );
  return filas.map(deFila);
}

export async function rutasAccesibilidad(app: FastifyInstance, { db }: Contexto) {
  const lectura = { preHandler: requiereFormato('accesibilidad', 'ver') };
  const edicion = { preHandler: requiereFormato('accesibilidad', 'editar') };

  // shortcut: el listado trae las evaluaciones completas; si crecen a cientos, devolver solo un resumen.
  app.get(BASE, lectura, () => cargar(db));

  /** Todas las evaluaciones en un .json (mismas reglas que el respaldo de ITA). */
  app.get(`${BASE}/respaldo`, lectura, async (req, reply) => {
    const fecha = new Date().toISOString();
    await auditar(db, req.usuario, 'accesibilidad-respaldo-descargado', null);
    reply.header('Content-Disposition', `attachment; filename="matriz-accesibilidad-datos_${fecha.slice(0, 10)}.json"`);
    return { app: 'matriz-accesibilidad', formato: 1, guardado: fecha, evaluaciones: await cargar(db) };
  });

  /**
   * Restaura un respaldo: un id nuevo se crea igual (con su ticket si está libre); uno que ya existe con la
   * misma fecha de modificación se omite, y con otra fecha se crea como copia. Nunca se sobrescribe.
   */
  app.post(`${BASE}/respaldo`, { preHandler: requiere('admin'), bodyLimit: 50 * 1024 * 1024 }, async (req) => {
    const { evaluaciones } = RespaldoAccesibilidad.parse(req.body);
    const res: ResultadoRestauracion = { creados: [], omitidos: [] };
    for (const r of evaluaciones) {
      const { id: origen, ticket, creado, actualizado, ...contenido } = r;
      const nombre = `Ticket ${ticket ?? '?'}${contenido.identificacion.requerimiento ? ' · ' + contenido.identificacion.requerimiento : ''}`;
      await enTransaccion(db, async (cx) => {
        const [ex] = await cx.query<RowDataPacket[]>('SELECT actualizado FROM evaluaciones_accesibilidad WHERE id = ?', [origen]);
        if (ex[0] && actualizado && ex[0]['actualizado'].getTime() === new Date(actualizado).getTime())
          return void res.omitidos.push({ id: origen, nombre, motivo: 'Ya estaba cargada' });
        const id = ex[0] ? nuevoId() : origen;
        // Conserva el ticket si está libre; si no, la base asigna el siguiente (NULL en AUTO_INCREMENT).
        const libre = !!ticket && !ex[0] && !(await cx.query<RowDataPacket[]>('SELECT 1 FROM evaluaciones_accesibilidad WHERE ticket = ?', [ticket]))[0].length;
        const ahora = new Date();
        await cx.query(
          'INSERT INTO evaluaciones_accesibilidad (id, ticket, contenido, creado, actualizado, creado_por, actualizado_por) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [id, libre ? ticket : null, JSON.stringify(completar(contenido as unknown as Contenido)),
            creado ? new Date(creado) : ahora, actualizado ? new Date(actualizado) : ahora, req.usuario!.id, req.usuario!.id],
        );
        const [e] = await cargar(cx, id);
        await auditar(cx, req.usuario, 'accesibilidad-restaurada', id, { origen, ticket: e!.ticket });
        res.creados.push({ id, nombre: `Ticket ${e!.ticket}${ex[0] ? ' (restaurada)' : ''}` });
      });
    }
    return res;
  });

  app.get<P>(`${BASE}/:id`, lectura, async (req) => {
    const [e] = await cargar(db, req.params.id);
    if (!e) throw new NoEncontrado('La evaluación no existe o fue eliminada.');
    return e;
  });

  app.post(BASE, edicion, async (req, reply) => {
    const id = nuevoId();
    const ahora = new Date();
    const creada = await enTransaccion(db, async (cx) => {
      await cx.query(
        'INSERT INTO evaluaciones_accesibilidad (id, contenido, creado, actualizado, creado_por, actualizado_por) VALUES (?, ?, ?, ?, ?, ?)',
        [id, JSON.stringify(contenidoVacio()), ahora, ahora, req.usuario!.id, req.usuario!.id],
      );
      const [e] = await cargar(cx, id);
      await auditar(cx, req.usuario, 'accesibilidad-creada', id, { ticket: e!.ticket });
      return e!;
    });
    return reply.code(201).send(creada);
  });

  /** Mezcla el cambio con el contenido guardado, con el registro bloqueado para no perder cambios simultáneos. */
  app.patch<P>(`${BASE}/:id`, edicion, async (req, reply) => {
    const cambio = CambioEvaluacion.parse(req.body);
    const ahora = new Date();
    const error = await enTransaccion(db, async (cx) => {
      const [f] = await cx.query<RowDataPacket[]>('SELECT contenido FROM evaluaciones_accesibilidad WHERE id = ? FOR UPDATE', [req.params.id]);
      if (!f[0]) throw new NoEncontrado('La evaluación no existe o fue eliminada.');
      const nuevo = aplicarCambio(completar(f[0]['contenido'] as Contenido), cambio as any);
      if (nuevo.evidencias.length > MAX_EVIDENCIAS) return `Se admiten como máximo ${MAX_EVIDENCIAS} evidencias.`;
      // Una evidencia nueva debe llegar con su URL.
      if (nuevo.evidencias.some((e) => !e.url)) return 'Cada evidencia debe tener una URL.';
      await cx.query('UPDATE evaluaciones_accesibilidad SET contenido = ?, actualizado = ?, actualizado_por = ? WHERE id = ?', [
        JSON.stringify(nuevo), ahora, req.usuario!.id, req.params.id,
      ]);
      await auditar(cx, req.usuario, 'accesibilidad-modificada', req.params.id, cambio);
      return null;
    });
    if (error) return reply.code(400).send({ error });
    return { ok: true, actualizado: ahora.toISOString() };
  });

  app.delete<P>(`${BASE}/:id`, { preHandler: requiere('admin') }, async (req, reply) => {
    await enTransaccion(db, async (cx) => {
      const [e] = await cargar(cx, req.params.id);
      if (!e) throw new NoEncontrado('La evaluación no existe o fue eliminada.');
      await cx.query('DELETE FROM evaluaciones_accesibilidad WHERE id = ?', [req.params.id]);
      await auditar(cx, req.usuario, 'accesibilidad-eliminada', e.id, { ticket: e.ticket });
      // Copia completa (auditar() recorta los textos) para poder recuperarla.
      await cx.query(
        "INSERT INTO auditoria (usuario_id, usuario, registro_id, accion, detalle) VALUES (?, ?, ?, 'accesibilidad-eliminada-copia', ?)",
        [req.usuario!.id, req.usuario!.usuario, e.id, JSON.stringify(e)],
      );
    });
    return reply.code(204).send();
  });
}
