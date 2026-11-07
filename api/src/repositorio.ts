import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import type { Evidencia, Registro, Respuesta } from '../../src/app/core/modelos';
import { normalizarUrl } from '../../src/app/core/modelos';
import type { Conexion } from './db';
import { ContenidoRegistro, VERSION_MATRIZ } from './esquemas';

type Fila = RowDataPacket & Record<string, any>;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : undefined);
const fecha = (s?: string) => {
  const d = s ? new Date(s) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

/** Carga registros completos (todos o los ids indicados), del más reciente al más antiguo. */
export async function cargarRegistros(cx: Conexion, ids?: string[]): Promise<Registro[]> {
  if (ids && !ids.length) return [];
  const filtro = ids ? 'WHERE id IN (?)' : '';
  const filtroHijos = ids ? 'WHERE registro_id IN (?)' : '';
  const p = ids ? [ids] : [];
  const [regs] = await cx.query<Fila[]>(`SELECT * FROM registros ${filtro} ORDER BY actualizado DESC`, p);
  if (!regs.length) return [];
  const [evs] = await cx.query<Fila[]>(`SELECT * FROM evidencias ${filtroHijos} ORDER BY registro_id, orden, id`, p);
  const [resps] = await cx.query<Fila[]>(`SELECT * FROM respuestas ${filtroHijos}`, p);
  const [rels] = await cx.query<Fila[]>(`SELECT * FROM respuesta_evidencias ${filtroHijos} ORDER BY orden`, p);

  const mapa = new Map<string, Registro>();
  for (const r of regs) {
    mapa.set(r['id'], {
      id: r['id'],
      nombre: r['nombre'],
      tipo: r['tipo'],
      vigencia: r['vigencia'],
      periodo: r['periodo'] ?? undefined,
      versionMatriz: r['version_matriz'],
      creado: iso(r['creado'])!,
      actualizado: iso(r['actualizado'])!,
      formatoEvidencias: r['formato_evidencias'],
      respuestas: {},
      evidencias: [],
    });
  }
  for (const e of evs) {
    const ev: Evidencia = { id: e['id'], titulo: e['titulo'], url: e['url'] };
    if (e['descripcion'] != null) ev.descripcion = e['descripcion'];
    if (e['verif_estado'])
      ev.verificacion = {
        fecha: iso(e['verif_fecha'])!,
        estado: e['verif_estado'],
        ...(e['verif_detalle'] ? { detalle: e['verif_detalle'] } : {}),
      };
    mapa.get(e['registro_id'])?.evidencias.push(ev);
  }
  for (const r of resps) {
    const resp: Respuesta = { estado: r['estado'], observacion: r['observacion'], evidencias: [] };
    if (r['nota_interna'] != null) resp.notaInterna = r['nota_interna'];
    if (r['actualizado']) resp.actualizado = iso(r['actualizado']);
    const reg = mapa.get(r['registro_id']);
    if (reg) reg.respuestas[r['fila']] = resp;
  }
  for (const x of rels) mapa.get(x['registro_id'])?.respuestas[x['fila']]?.evidencias.push(x['evidencia_id']);
  return [...mapa.values()];
}

export async function cargarRegistro(cx: Conexion, id: string): Promise<Registro | null> {
  return (await cargarRegistros(cx, [id]))[0] ?? null;
}

export interface DatosNuevoRegistro {
  id: string;
  nombre: string;
  tipo: 'procuraduria' | 'seguimiento';
  vigencia: number;
  periodo?: string | null;
  creado?: string;
  actualizado?: string;
  versionMatriz?: string;
}

/** Inserta un registro con su contenido. Debe llamarse dentro de una transacción. */
export async function insertarRegistro(
  cx: Conexion,
  d: DatosNuevoRegistro,
  contenido: z.output<typeof ContenidoRegistro> | null,
  usuarioId: number | null,
  limpiarVerificacion = false,
): Promise<void> {
  const creado = fecha(d.creado);
  const actualizado = fecha(d.actualizado ?? d.creado);
  await cx.query(
    `INSERT INTO registros (id, nombre, tipo, vigencia, periodo, version_matriz, formato_evidencias,
                            creado, actualizado, creado_por, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      d.id, d.nombre, d.tipo, d.vigencia, d.periodo || null, d.versionMatriz ?? VERSION_MATRIZ,
      contenido?.formatoEvidencias ?? 'url', creado, actualizado, usuarioId, usuarioId,
    ],
  );
  if (!contenido) return;

  // Evidencias: se descartan ids o URLs repetidas (se conserva la primera).
  const vistasId = new Set<string>();
  const porUrl = new Map<string, string>();
  const reemplazo = new Map<string, string>();
  const evs: unknown[][] = [];
  contenido.evidencias.forEach((e, orden) => {
    const url = normalizarUrl(e.url);
    const previo = porUrl.get(url);
    if (previo) return void reemplazo.set(e.id, previo);
    if (vistasId.has(e.id)) return;
    vistasId.add(e.id);
    porUrl.set(url, e.id);
    const v = limpiarVerificacion ? undefined : e.verificacion;
    evs.push([d.id, e.id, orden, e.titulo ?? '', url, e.descripcion ?? null,
      v ? fecha(v.fecha) : null, v?.estado ?? null, v?.detalle ?? null]);
  });
  if (evs.length)
    await cx.query(
      `INSERT INTO evidencias (registro_id, id, orden, titulo, url, descripcion, verif_fecha, verif_estado, verif_detalle) VALUES ?`,
      [evs],
    );

  const resps: unknown[][] = [];
  const rels: unknown[][] = [];
  for (const [f, r] of Object.entries(contenido.respuestas)) {
    resps.push([d.id, +f, r.estado ?? null, r.observacion ?? '', r.notaInterna ?? null,
      r.actualizado ? fecha(r.actualizado) : null, usuarioId]);
    const ids = new Set<string>();
    for (const evId of r.evidencias) {
      const real = reemplazo.get(evId) ?? evId;
      if (vistasId.has(real) && !ids.has(real)) {
        ids.add(real);
        rels.push([d.id, +f, real, ids.size - 1]);
      }
    }
  }
  if (resps.length)
    await cx.query(
      `INSERT INTO respuestas (registro_id, fila, estado, observacion, nota_interna, actualizado, actualizado_por) VALUES ?`,
      [resps],
    );
  if (rels.length) await cx.query(`INSERT INTO respuesta_evidencias (registro_id, fila, evidencia_id, orden) VALUES ?`, [rels]);
}

/** Marca el registro como modificado ahora por `usuarioId`. */
export async function tocarRegistro(cx: Conexion, id: string, usuarioId: number): Promise<void> {
  await cx.query('UPDATE registros SET actualizado = ?, actualizado_por = ? WHERE id = ?', [new Date(), usuarioId, id]);
}

/** Bloquea el registro (SELECT … FOR UPDATE) y devuelve si existe. */
export async function bloquearRegistro(cx: Conexion, id: string): Promise<boolean> {
  const [r] = await cx.query<Fila[]>('SELECT id FROM registros WHERE id = ? FOR UPDATE', [id]);
  return r.length > 0;
}

/** Crea las filas de respuesta que falten (vacías) para poder asociarles evidencias. */
export async function asegurarRespuestas(cx: Conexion, registroId: string, filas: number[]): Promise<void> {
  await cx.query(
    `INSERT IGNORE INTO respuestas (registro_id, fila, estado, observacion) VALUES ?`,
    [filas.map((f) => [registroId, f, null, ''])],
  );
}
