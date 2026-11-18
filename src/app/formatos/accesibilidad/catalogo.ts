import catalogoJson from '../../data/catalogo-accesibilidad.json';
import { Contenido, Criterio, CriterioCatalogo, Hallazgo, Nivel, hallazgoVacio } from './modelo';

/** Generado por tools/preparar_accesibilidad.py a partir de la matriz oficial. */
export const CATALOGO_ACC = catalogoJson as {
  criterios: CriterioCatalogo[];
  herramientas: { fila: number; nombre: string }[];
  maxHallazgos: number;
};
export const PLANTILLA_ACC_URL = 'plantilla/matriz-evaluacion-accesibilidad.xlsx';

/** Principios de WCAG (P1 a P4): son las secciones de criterios en la barra lateral. */
export const PRINCIPIOS = (() => {
  const out: { clave: string; titulo: string; criterios: CriterioCatalogo[] }[] = [];
  for (const c of CATALOGO_ACC.criterios) {
    let p = out.find((x) => x.titulo === c.principio);
    if (!p) out.push((p = { clave: 'p' + (out.length + 1), titulo: c.principio, criterios: [] }));
    p.criterios.push(c);
  }
  return out;
})();

export type ProblemaCriterio = 'sin-estado' | 'sin-soporte' | 'na-sin-justificacion' | 'no-sin-observacion';

/** Mismas reglas de revisión que en ITA: toda decisión debe quedar sustentada, y "No aplica", justificada. */
export function problemasCriterio(r: Criterio | undefined): ProblemaCriterio[] {
  if (!r?.estado) return ['sin-estado'];
  const texto = !!r.observacion.trim();
  if (r.estado === 'cumple' && !texto && !r.evidencias.length) return ['sin-soporte'];
  if (r.estado === 'noAplica' && !texto) return ['na-sin-justificacion'];
  if (r.estado === 'noCumple' && !texto) return ['no-sin-observacion'];
  return [];
}

export type NivelAlcanzado = 'na' | 'noAccesible' | Nivel;

/** Clase de `chip-estado` de cada nivel alcanzado; el texto del chip dice el nivel, el color solo lo acompaña. */
export const CHIP_NIVEL = { na: 'NA', noAccesible: 'NO', A: 'pendiente', AA: 'SI', AAA: 'SI' } as const;
type Conteo = { cumple: number; noCumple: number; noAplica: number; total: number };

/** Tabla de consolidado de la hoja 2, con la misma regla de la fórmula del .xlsx (celda D3). */
export function consolidado(c: Pick<Contenido, 'criterios'>, criterios = CATALOGO_ACC.criterios) {
  const nuevo = (): Conteo => ({ cumple: 0, noCumple: 0, noAplica: 0, total: 0 });
  const total = nuevo();
  const porNivel: Record<Nivel, Conteo> = { A: nuevo(), AA: nuevo(), AAA: nuevo() };
  for (const it of criterios) {
    const e = c.criterios[it.fila]?.estado;
    porNivel[it.nivel].total++;
    total.total++;
    if (e) porNivel[it.nivel][e]++, total[e]++;
  }
  const evaluados = total.cumple + total.noCumple + total.noAplica;
  const conProblemas = criterios.filter((it) => problemasCriterio(c.criterios[it.fila]).some((p) => p !== 'sin-estado')).length;
  const porcentaje = total.total ? Math.round((evaluados / total.total) * 100) : 0;
  const nivel: NivelAlcanzado =
    evaluados < total.total ? 'na'
    : porNivel.A.noCumple ? 'noAccesible'
    : porNivel.AA.noCumple ? 'A'
    : porNivel.AAA.cumple ? 'AAA'
    : 'AA';
  return { ...total, evaluados, conProblemas, porcentaje, porNivel, nivel };
}

/** Severidad inicial de un hallazgo según el nivel del criterio. Crítica la elige siempre el usuario. */
export const SEVERIDAD_SUGERIDA: Record<Nivel, Hallazgo['severidad']> = { A: 'alta', AA: 'media', AAA: 'baja' };

/** Id del hallazgo de un criterio (uno por criterio en "No cumple"). */
export const idHallazgo = (fila: number) => `c${fila}`;

export interface HallazgoGenerado extends Hallazgo {
  hallazgo: string;
  fila: number;
  cat: CriterioCatalogo;
  /** La severidad es la sugerida (el usuario aún no la eligió). */
  sugerida: boolean;
}

/**
 * Hallazgos de la hoja 3: uno por cada criterio en "No cumple", en el orden de la matriz.
 * Lo guardado (acción, responsable…) se conserva aunque el criterio cambie de estado y reaparece
 * si vuelve a "No cumple". Sin texto propio se usa la observación del criterio; sin severidad, la sugerida.
 */
export function hallazgosGenerados(c: Pick<Contenido, 'criterios' | 'hallazgos'>): HallazgoGenerado[] {
  return CATALOGO_ACC.criterios
    .filter((it) => c.criterios[it.fila]?.estado === 'noCumple')
    .map((it) => {
      const id = idHallazgo(it.fila);
      const h = c.hallazgos.find((x) => x.id === id) ?? hallazgoVacio(id);
      return {
        ...h,
        fila: it.fila,
        cat: it,
        criterio: it.sc,
        hallazgo: h.hallazgo ?? c.criterios[it.fila]!.observacion,
        severidad: h.severidad || SEVERIDAD_SUGERIDA[it.nivel],
        sugerida: !h.severidad,
      };
    });
}

/** El plan de tratamiento del hallazgo tiene acción, responsable, fecha y estado. */
export const planCompleto = (h: Hallazgo) => !!(h.accion.trim() && h.responsable.trim() && h.fecha && h.estado);
