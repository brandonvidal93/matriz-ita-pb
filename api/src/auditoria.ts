import type { Usuario } from '../../src/app/core/modelos';
import type { Conexion } from './db';

/** Registra una acción en el historial. `detalle` se guarda como JSON. */
export async function auditar(
  cx: Conexion,
  usuario: Pick<Usuario, 'id' | 'usuario'> | null,
  accion: string,
  registroId: string | null,
  detalle?: unknown,
): Promise<void> {
  await cx.query('INSERT INTO auditoria (usuario_id, usuario, registro_id, accion, detalle) VALUES (?, ?, ?, ?, ?)', [
    usuario?.id ?? null,
    usuario?.usuario ?? null,
    registroId,
    accion,
    detalle === undefined ? null : JSON.stringify(recortar(detalle)),
  ]);
}

/** Evita guardar textos enormes en el historial. */
function recortar(v: unknown): unknown {
  if (typeof v === 'string') return v.length > 500 ? v.slice(0, 500) + '…' : v;
  if (Array.isArray(v)) return v.map(recortar);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, recortar(x)]));
  return v;
}
