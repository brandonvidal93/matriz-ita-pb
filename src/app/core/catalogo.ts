import catalogoJson from '../data/catalogo-ita-2023.json';
import { Catalogo, Evidencia, ItemCatalogo, Registro, Respuesta } from './modelos';

export const CATALOGO: Catalogo = catalogoJson as Catalogo;
export const PLANTILLA_URL = 'plantilla/matriz-ita-2023.xlsx';

export interface Seccion {
  clave: string;
  grupo: string;
  titulo: string;
  items: ItemCatalogo[];
}

/** Secciones de navegación: Nivel I de la matriz, agrupadas por bloque. */
export const SECCIONES: Seccion[] = (() => {
  const out: Seccion[] = [];
  for (const it of CATALOGO.items) {
    const titulo = it.nivel1 || it.grupo;
    let s = out.find((x) => x.titulo === titulo && x.grupo === it.grupo);
    if (!s) {
      s = { clave: 's' + it.fila, grupo: it.grupo, titulo, items: [] };
      out.push(s);
    }
    s.items.push(it);
  }
  return out;
})();

export const ITEM_POR_FILA = new Map(CATALOGO.items.map((i) => [i.fila, i]));

export function etiquetaCorta(it: ItemCatalogo, max = 90): string {
  const t = it.item.replace(/\s+/g, ' ');
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Texto final que se escribirá en la columna I del archivo oficial. */
export function textoObservacion(r: Respuesta | undefined, reg: Registro): string {
  if (!r) return '';
  const partes: string[] = [];
  if (r.observacion?.trim()) partes.push(r.observacion.trim());
  const evs = r.evidencias
    .map((id) => reg.evidencias.find((e) => e.id === id))
    .filter((e): e is Evidencia => !!e);
  for (const e of evs) {
    partes.push(reg.formatoEvidencias === 'titulo-url' && e.titulo ? `${e.titulo}: ${e.url}` : e.url);
  }
  return partes.join('\n');
}

export type ProblemaItem = 'sin-estado' | 'sin-soporte' | 'na-sin-justificacion' | 'no-sin-justificacion';

/** Reglas mínimas de calidad antes de exportar. */
export function problemas(it: ItemCatalogo, r: Respuesta | undefined): ProblemaItem[] {
  const p: ProblemaItem[] = [];
  if (it.tipo === 'numero') {
    if (!r?.observacion?.trim()) p.push('sin-estado');
    return p;
  }
  if (!r?.estado) {
    p.push('sin-estado');
    return p;
  }
  const tieneTexto = !!r.observacion?.trim();
  if (r.estado === 'SI' && !r.evidencias.length && !tieneTexto) p.push('sin-soporte');
  if (r.estado === 'NA' && !tieneTexto) p.push('na-sin-justificacion');
  if (r.estado === 'NO' && !tieneTexto) p.push('no-sin-justificacion');
  return p;
}

export const TEXTO_PROBLEMA: Record<ProblemaItem, string> = {
  'sin-estado': 'Sin diligenciar',
  'sin-soporte': 'Cumple (SI) sin evidencia ni observación',
  'na-sin-justificacion': 'N/A sin justificación jurídica',
  'no-sin-justificacion': 'NO sin observación',
};
