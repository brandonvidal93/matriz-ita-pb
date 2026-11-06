import { CATALOGO, problemas } from './catalogo';
import { ItemCatalogo, Registro } from './modelos';

export interface Progreso {
  total: number;
  diligenciados: number;
  si: number;
  no: number;
  na: number;
  conProblemas: number;
  porcentaje: number;
}

export function progreso(reg: Registro, items: ItemCatalogo[] = CATALOGO.items): Progreso {
  let diligenciados = 0, si = 0, no = 0, na = 0, conProblemas = 0;
  for (const it of items) {
    const r = reg.respuestas[it.fila];
    const p = problemas(it, r);
    if (!p.includes('sin-estado')) diligenciados++;
    if (p.length) conProblemas++;
    if (r?.estado === 'SI') si++;
    if (r?.estado === 'NO') no++;
    if (r?.estado === 'NA') na++;
  }
  const total = items.length;
  return { total, diligenciados, si, no, na, conProblemas, porcentaje: total ? Math.round((diligenciados / total) * 100) : 0 };
}

export function descargar(blob: Blob, nombre: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function nombreArchivo(reg: Registro, ext: string): string {
  const base = reg.nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
  const fecha = new Date().toISOString().slice(0, 10);
  return `Matriz_ITA_${base}_${fecha}.${ext}`;
}

/** Comprueba si el servidor de una URL responde (sin poder leer el código por CORS). */
export async function verificarUrl(url: string, ms = 10000): Promise<'ok' | 'error'> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal, redirect: 'follow' });
    return 'ok';
  } catch {
    return 'error';
  } finally {
    clearTimeout(t);
  }
}
