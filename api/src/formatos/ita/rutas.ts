import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RowDataPacket } from 'mysql2/promise';
import { nuevoId, normalizarUrl } from '../../../../src/app/core/modelos';
import { auditar } from '../../auditoria';
import { requiere, requiereFormato } from '../../auth';
import type { Contexto } from '../../app';
import { enTransaccion } from '../../db';
import { NoEncontrado } from '../../errores';
import {
  CambioEvidencia, CambioRegistro, CambioRespuestas, EvidenciaEntrada, Filas, NuevoRegistro,
} from './esquemas';
import {
  asegurarRespuestas, bloquearRegistro, cargarRegistro, cargarRegistros, insertarRegistro, tocarRegistro,
} from './repositorio';

type P = { Params: { id: string; evId: string } };

const noEncontrado = (reply: FastifyReply) => reply.code(404).send({ error: 'El registro no existe o fue eliminado.' });

export async function rutasRegistros(app: FastifyInstance, { db }: Contexto) {
  const lectura = { preHandler: requiereFormato('ita', 'ver') };
  const edicion = { preHandler: requiereFormato('ita', 'editar') };

  /**
   * Ejecuta un cambio sobre un registro en una transacción: lo bloquea,
   * aplica `fn`, actualiza la marca de modificación y audita.
   */
  async function cambiar<T>(
    registroId: string,
    usuario: NonNullable<Parameters<typeof auditar>[1]>,
    accion: string,
    detalle: unknown,
    fn: (cx: Parameters<Parameters<typeof enTransaccion>[1]>[0]) => Promise<T>,
  ): Promise<T> {
    return enTransaccion(db, async (cx) => {
      if (!(await bloquearRegistro(cx, registroId))) throw new NoEncontrado();
      const r = await fn(cx);
      await tocarRegistro(cx, registroId, usuario.id);
      await auditar(cx, usuario, accion, registroId, detalle);
      return r;
    });
  }

  // ---------- registros ----------
  app.get('/api/registros', lectura, () => cargarRegistros(db));

  app.get<P>('/api/registros/:id', lectura, async (req, reply) => {
    const r = await cargarRegistro(db, req.params.id);
    return r ?? noEncontrado(reply);
  });

  app.post('/api/registros', { ...edicion, bodyLimit: 20 * 1024 * 1024 }, async (req, reply) => {
    const d = NuevoRegistro.parse(req.body);
    const u = req.usuario!;
    const id = d.id ?? nuevoId();
    const creado = await enTransaccion(db, async (cx) => {
      let contenido = d.contenido ?? null;
      let limpiar = false;
      if (d.baseId) {
        const base = await cargarRegistro(cx, d.baseId);
        if (!base) throw new NoEncontrado();
        contenido = { respuestas: base.respuestas, evidencias: base.evidencias, formatoEvidencias: base.formatoEvidencias } as any;
        limpiar = true; // la verificación de enlaces no se hereda
      }
      const [existe] = await cx.query<RowDataPacket[]>('SELECT 1 FROM registros WHERE id = ?', [id]);
      if (existe.length) return null;
      await insertarRegistro(cx, { id, nombre: d.nombre, tipo: d.tipo, vigencia: d.vigencia, periodo: d.periodo }, contenido, u.id, limpiar);
      await auditar(cx, u, 'registro-creado', id, { nombre: d.nombre, baseId: d.baseId, importado: !!d.contenido });
      return cargarRegistro(cx, id);
    });
    if (!creado) return reply.code(409).send({ error: 'Ya existe un registro con ese identificador.' });
    return reply.code(201).send(creado);
  });

  app.patch<P>('/api/registros/:id', edicion, async (req) => {
    const d = CambioRegistro.parse(req.body);
    await cambiar(req.params.id, req.usuario!, 'registro-modificado', d, async (cx) => {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (d.nombre !== undefined) sets.push('nombre = ?'), vals.push(d.nombre);
      if (d.tipo !== undefined) sets.push('tipo = ?'), vals.push(d.tipo);
      if (d.vigencia !== undefined) sets.push('vigencia = ?'), vals.push(d.vigencia);
      if (d.periodo !== undefined) sets.push('periodo = ?'), vals.push(d.periodo || null);
      if (d.formatoEvidencias !== undefined) sets.push('formato_evidencias = ?'), vals.push(d.formatoEvidencias);
      await cx.query(`UPDATE registros SET ${sets.join(', ')} WHERE id = ?`, [...vals, req.params.id]);
    });
    return cargarRegistro(db, req.params.id);
  });

  app.delete<P>('/api/registros/:id', { preHandler: requiere('admin') }, async (req, reply) => {
    const r = await cargarRegistro(db, req.params.id);
    if (!r) return noEncontrado(reply);
    await enTransaccion(db, async (cx) => {
      await cx.query('DELETE FROM registros WHERE id = ?', [req.params.id]);
      // Se guarda el contenido completo en el historial para poder recuperarlo.
      await auditar(cx, req.usuario, 'registro-eliminado', req.params.id, { nombre: r.nombre });
      await cx.query("INSERT INTO auditoria (usuario_id, usuario, registro_id, accion, detalle) VALUES (?, ?, ?, 'registro-eliminado-copia', ?)", [
        req.usuario!.id, req.usuario!.usuario, r.id, JSON.stringify(r),
      ]);
    });
    return reply.code(204).send();
  });

  // ---------- respuestas ----------
  app.patch<P>('/api/registros/:id/respuestas', edicion, async (req) => {
    const { filas, cambios } = CambioRespuestas.parse(req.body);
    const ahora = new Date();
    await cambiar(req.params.id, req.usuario!, 'respuestas', { filas, cambios }, async (cx) => {
      await asegurarRespuestas(cx, req.params.id, filas);
      const sets = ['actualizado = ?', 'actualizado_por = ?'];
      const vals: unknown[] = [ahora, req.usuario!.id];
      if ('estado' in cambios) sets.push('estado = ?'), vals.push(cambios.estado ?? null);
      if (cambios.observacion !== undefined) sets.push('observacion = ?'), vals.push(cambios.observacion);
      if (cambios.notaInterna !== undefined) sets.push('nota_interna = ?'), vals.push(cambios.notaInterna);
      await cx.query(`UPDATE respuestas SET ${sets.join(', ')} WHERE registro_id = ? AND fila IN (?)`, [...vals, req.params.id, filas]);
    });
    return { ok: true, actualizado: ahora.toISOString() };
  });

  // ---------- evidencias ----------
  app.post<P>('/api/registros/:id/evidencias', edicion, async (req, reply) => {
    const e = EvidenciaEntrada.parse(req.body);
    const url = normalizarUrl(e.url);
    const res = await cambiar(req.params.id, req.usuario!, 'evidencia-agregada', { id: e.id, url }, async (cx) => {
      const [ex] = await cx.query<RowDataPacket[]>('SELECT id, url FROM evidencias WHERE registro_id = ?', [req.params.id]);
      const dup = ex.find((x) => normalizarUrl(x['url']) === url || x['id'] === e.id);
      if (dup) return { duplicada: dup['id'] as string };
      const [o] = await cx.query<RowDataPacket[]>('SELECT COALESCE(MAX(orden), -1) + 1 AS o FROM evidencias WHERE registro_id = ?', [req.params.id]);
      await cx.query(
        'INSERT INTO evidencias (registro_id, id, orden, titulo, url, descripcion) VALUES (?, ?, ?, ?, ?, ?)',
        [req.params.id, e.id, o[0]!['o'], e.titulo, url, e.descripcion ?? null],
      );
      return { duplicada: null };
    });
    const reg = (await cargarRegistro(db, req.params.id))!;
    const ev = reg.evidencias.find((x) => x.id === (res.duplicada ?? e.id))!;
    return reply.code(res.duplicada ? 200 : 201).send(ev);
  });

  app.patch<P>('/api/registros/:id/evidencias/:evId', edicion, async (req, reply) => {
    const d = CambioEvidencia.parse(req.body);
    const { id, evId } = req.params;
    const ok = await cambiar(id, req.usuario!, 'evidencia-modificada', { id: evId, ...d }, async (cx) => {
      const sets: string[] = [];
      const vals: unknown[] = [];
      if (d.titulo !== undefined) sets.push('titulo = ?'), vals.push(d.titulo);
      if (d.url !== undefined) {
        const url = normalizarUrl(d.url);
        const [ex] = await cx.query<RowDataPacket[]>('SELECT id, url FROM evidencias WHERE registro_id = ? AND id <> ?', [id, evId]);
        if (ex.some((x) => normalizarUrl(x['url']) === url)) return 'url-duplicada';
        sets.push('url = ?'), vals.push(url);
      }
      if (d.descripcion !== undefined) sets.push('descripcion = ?'), vals.push(d.descripcion);
      if (d.verificacion !== undefined) {
        const v = d.verificacion;
        sets.push('verif_fecha = ?', 'verif_estado = ?', 'verif_detalle = ?');
        vals.push(v ? new Date(v.fecha) : null, v?.estado ?? null, v?.detalle ?? null);
      }
      if (!sets.length) return 'ok';
      const [r] = await cx.query<any>(`UPDATE evidencias SET ${sets.join(', ')} WHERE registro_id = ? AND id = ?`, [...vals, id, evId]);
      return r.affectedRows ? 'ok' : 'no-existe';
    });
    if (ok === 'url-duplicada') return reply.code(409).send({ error: 'Ya existe otra evidencia con esa URL.' });
    if (ok === 'no-existe') return reply.code(404).send({ error: 'La evidencia no existe.' });
    return (await cargarRegistro(db, id))!.evidencias.find((x) => x.id === evId);
  });

  app.delete<P>('/api/registros/:id/evidencias/:evId', edicion, async (req, reply) => {
    await cambiar(req.params.id, req.usuario!, 'evidencia-eliminada', { id: req.params.evId }, (cx) =>
      cx.query('DELETE FROM evidencias WHERE registro_id = ? AND id = ?', [req.params.id, req.params.evId]),
    );
    return reply.code(204).send();
  });

  app.post<P>('/api/registros/:id/evidencias/:evId/asignar', edicion, async (req, reply) => {
    const { filas } = Filas.parse(req.body);
    const { id, evId } = req.params;
    const ok = await cambiar(id, req.usuario!, 'evidencia-asignada', { id: evId, filas }, async (cx) => {
      const [ev] = await cx.query<RowDataPacket[]>('SELECT 1 FROM evidencias WHERE registro_id = ? AND id = ?', [id, evId]);
      if (!ev.length) return false;
      await asegurarRespuestas(cx, id, filas);
      // La evidencia se agrega al final de las que ya tenga cada ítem.
      await cx.query(
        `INSERT IGNORE INTO respuesta_evidencias (registro_id, fila, evidencia_id, orden)
         SELECT r.registro_id, r.fila, ?, COALESCE((SELECT MAX(x.orden) + 1 FROM respuesta_evidencias x
                                                    WHERE x.registro_id = r.registro_id AND x.fila = r.fila), 0)
         FROM respuestas r WHERE r.registro_id = ? AND r.fila IN (?)`,
        [evId, id, filas],
      );
      await cx.query('UPDATE respuestas SET actualizado = ?, actualizado_por = ? WHERE registro_id = ? AND fila IN (?)', [
        new Date(), req.usuario!.id, id, filas,
      ]);
      return true;
    });
    if (!ok) return reply.code(404).send({ error: 'La evidencia no existe.' });
    return { ok: true };
  });

  app.post<P>('/api/registros/:id/evidencias/:evId/quitar', edicion, async (req) => {
    const { filas } = Filas.parse(req.body);
    const { id, evId } = req.params;
    await cambiar(id, req.usuario!, 'evidencia-quitada', { id: evId, filas }, (cx) =>
      cx.query('DELETE FROM respuesta_evidencias WHERE registro_id = ? AND evidencia_id = ? AND fila IN (?)', [id, evId, filas]),
    );
    return { ok: true };
  });

  // ---------- historial ----------
  app.get<P & { Querystring: { limite?: string } }>('/api/registros/:id/historial', { preHandler: requiere('admin') }, async (req) => {
    const limite = Math.min(Math.max(Number(req.query.limite) || 200, 1), 1000);
    const [filas] = await db.query<RowDataPacket[]>(
      "SELECT fecha, usuario, accion, detalle FROM auditoria WHERE registro_id = ? AND accion <> 'registro-eliminado-copia' ORDER BY id DESC LIMIT ?",
      [req.params.id, limite],
    );
    return filas.map((f) => ({ fecha: f['fecha'].toISOString(), usuario: f['usuario'], accion: f['accion'], detalle: f['detalle'] }));
  });
}
