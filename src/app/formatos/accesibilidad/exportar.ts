import JSZip from 'jszip';
import { textoObservacion } from '../../core/catalogo';
import { ValorCelda, escribirFila } from '../../core/xlsx.service';
import { CATALOGO_ACC, PLANTILLA_ACC_URL, hallazgosGenerados } from './catalogo';
import { Evaluacion, Lista, OPCIONES } from './modelo';

type Celdas = Record<number, Record<string, ValorCelda>>;

/** AAAA-MM-DD → número de serie de Excel, para que la celda conserve su formato de fecha. */
export function serialExcel(iso: string): number | '' {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? (Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86_400_000 : '';
}

/** AAAA-MM-DD → d/m/aaaa, para celdas con formato General (fecha compromiso de la hoja 3). */
const fechaTexto = (iso: string) => iso.split('-').reverse().map((x, i) => (i < 2 ? String(+x) : x)).join('/');

const op = (l: Lista, v: string | null) => (v ? ((OPCIONES[l] as Record<string, string>)[v] ?? '') : '');

/** Celdas que se escriben en cada hoja (las mismas que vacía tools/preparar_accesibilidad.py). */
function celdas(ev: Evaluacion): Record<string, Celdas> {
  const i = ev.identificacion;
  const c = ev.cierre;
  const hoja2: Celdas = {};
  for (const it of CATALOGO_ACC.criterios) {
    const r = ev.criterios[it.fila];
    if (r) hoja2[it.fila] = { H: op('estado', r.estado), J: textoObservacion(r, ev) };
  }
  const hoja3: Celdas = {};
  // La plantilla tiene maxHallazgos filas; Revisar y exportar avisa si hay más.
  hallazgosGenerados(ev).slice(0, CATALOGO_ACC.maxHallazgos).forEach((h, n) => {
    hoja3[5 + n] = {
      B: h.criterio, C: textoObservacion({ observacion: h.hallazgo, evidencias: h.evidencias }, ev), D: op('severidad', h.severidad), E: h.accion,
      F: h.responsable, G: h.fecha && fechaTexto(h.fecha), H: op('estadoHallazgo', h.estado),
    };
  });
  const hoja4: Celdas = {
    // El texto de la hoja 4 y, debajo, todas las evidencias de la evaluación.
    12: { A: textoObservacion({ observacion: c.evidencias, evidencias: ev.evidencias.map((e) => e.id) }, ev) }, 15: { A: c.automatizadas }, 18: { A: c.manuales },
    21: { B: op('resultado', c.resultado) }, 22: { B: c.justificacion }, 23: { B: op('decision', c.decision) },
    24: { B: c.profesional }, 25: { B: c.cargo }, 26: { B: serialExcel(c.fecha) }, 27: { B: c.editorial },
  };
  for (const h of CATALOGO_ACC.herramientas) hoja4[h.fila] = { A: c.herramientas.includes(h.fila) };
  return {
    'sheet1.xml': {
      7: { B: ev.ticket }, 8: { B: i.requerimiento }, 9: { B: i.url }, 10: { B: op('ambiente', i.ambiente) },
      11: { B: i.responsable }, 12: { B: serialExcel(i.fecha) }, 13: { B: i.entorno }, 14: { B: op('tipo', i.tipo) },
    },
    'sheet2.xml': hoja2,
    'sheet3.xml': hoja3,
    'sheet4.xml': hoja4,
  };
}

/**
 * Llena la plantilla editando el XML de las hojas 1 a 4. Las fórmulas del
 * consolidado y los gráficos se recalculan al abrir el archivo (fullCalcOnLoad).
 */
export async function exportarEvaluacion(ev: Evaluacion): Promise<Blob> {
  const r = await fetch(PLANTILLA_ACC_URL);
  if (!r.ok) throw new Error('No se encontró la plantilla (public/plantilla).');
  const zip = await JSZip.loadAsync(await r.arrayBuffer());
  for (const [nombre, filas] of Object.entries(celdas(ev))) {
    const ruta = `xl/worksheets/${nombre}`;
    let hoja = await zip.file(ruta)!.async('string');
    for (const [fila, valores] of Object.entries(filas)) {
      // Lo vacío no se escribe: la celda queda en blanco, como en la plantilla.
      const conValor = Object.fromEntries(Object.entries(valores).filter(([, v]) => v !== ''));
      if (Object.keys(conValor).length) hoja = escribirFila(hoja, +fila, conValor);
    }
    zip.file(ruta, hoja, { createFolders: false });
  }
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export const nombreArchivoAcc = (ev: Evaluacion) =>
  `Matriz_Accesibilidad_ticket-${ev.ticket}_${new Date().toISOString().slice(0, 10)}.xlsx`;
