import type { FastifyInstance } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { nuevoId } from '../../../../src/app/core/modelos';
import { CATALOGO_ACC } from '../../../../src/app/formatos/accesibilidad/catalogo';
import { aplicarCambio, contenidoVacio, type Contenido, type Evaluacion } from '../../../../src/app/formatos/accesibilidad/modelo';
import { auditar } from '../../auditoria';
import { requiere, requiereFormato } from '../../auth';
import type { Contexto } from '../../app';
import type { Conexion } from '../../db';
import { enTransaccion } from '../../db';
import { NoEncontrado } from '../../errores';
import { CambioEvaluacion } from './esquemas';

type P = { Params: { id: string } };
const BASE = '/api/accesibilidad';

const deFila = (f: RowDataPacket): Evaluacion => ({
  ...(f['contenido'] as Contenido),
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
      const nuevo = aplicarCambio(f[0]['contenido'] as Contenido, cambio as any);
      if (nuevo.hallazgos.length > CATALOGO_ACC.maxHallazgos)
        return `La plantilla admite como máximo ${CATALOGO_ACC.maxHallazgos} hallazgos.`;
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
