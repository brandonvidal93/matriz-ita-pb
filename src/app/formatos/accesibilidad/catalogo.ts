import catalogoJson from '../../data/catalogo-accesibilidad.json';
import { Contenido, CriterioCatalogo, Nivel } from './modelo';

/** Generado por tools/preparar_accesibilidad.py a partir de la matriz oficial. */
export const CATALOGO_ACC = catalogoJson as {
  criterios: CriterioCatalogo[];
  herramientas: { fila: number; nombre: string }[];
  maxHallazgos: number;
};
export const PLANTILLA_ACC_URL = 'plantilla/matriz-evaluacion-accesibilidad.xlsx';

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
  const nivel: NivelAlcanzado =
    evaluados < total.total ? 'na'
    : porNivel.A.noCumple ? 'noAccesible'
    : porNivel.AA.noCumple ? 'A'
    : porNivel.AAA.cumple ? 'AAA'
    : 'AA';
  return { ...total, evaluados, porNivel, nivel };
}
