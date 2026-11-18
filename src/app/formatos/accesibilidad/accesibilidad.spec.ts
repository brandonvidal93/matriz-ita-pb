import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { exportarEvaluacion, serialExcel } from './exportar';
import { CATALOGO_ACC, consolidado } from './catalogo';
import { Evaluacion, Nivel, aplicarCambio, contenidoVacio } from './modelo';

const PLANTILLA = readFileSync(resolve(process.cwd(), 'public/plantilla/matriz-evaluacion-accesibilidad.xlsx'));
const primero = (n: Nivel) => CATALOGO_ACC.criterios.find((c) => c.nivel === n)!.fila;

/** Todos los criterios con `estado`, salvo los cambios indicados. */
function todos(estado: 'cumple' | 'noAplica', cambios: Record<number, 'cumple' | 'noCumple' | 'noAplica'> = {}) {
  return { criterios: Object.fromEntries(CATALOGO_ACC.criterios.map((c) => [c.fila, { estado: cambios[c.fila] ?? estado, observacion: '' }])) };
}

describe('consolidado de accesibilidad', () => {
  it('sigue la fórmula de la hoja 2', () => {
    expect(consolidado({ criterios: {} }).nivel).toBe('na');
    expect(consolidado({ criterios: { [primero('A')]: { estado: 'cumple', observacion: '' } } }).nivel).toBe('na');
    expect(consolidado(todos('noAplica')).nivel).toBe('AA');
    expect(consolidado(todos('noAplica', { [primero('AAA')]: 'cumple' })).nivel).toBe('AAA');
    expect(consolidado(todos('cumple', { [primero('AA')]: 'noCumple' })).nivel).toBe('A');
    expect(consolidado(todos('cumple', { [primero('A')]: 'noCumple', [primero('AA')]: 'noCumple' })).nivel).toBe('noAccesible');
    const c = consolidado(todos('cumple', { [primero('A')]: 'noCumple' }));
    expect(c).toMatchObject({ total: 78, evaluados: 78, noCumple: 1, cumple: 77 });
    expect(c.porNivel.A.total + c.porNivel.AA.total + c.porNivel.AAA.total).toBe(78);
  });

  it('aplica cambios parciales y agrega, modifica y elimina hallazgos', () => {
    let c = aplicarCambio(contenidoVacio(), { hallazgos: { a: { hallazgo: 'uno' }, b: { hallazgo: 'dos' } }, criterios: { 13: { estado: 'cumple' } } });
    c = aplicarCambio(c, { hallazgos: { a: null, b: { severidad: 'alta' } }, criterios: { 13: { observacion: 'ok' } } });
    expect(c.hallazgos).toEqual([expect.objectContaining({ id: 'b', hallazgo: 'dos', severidad: 'alta' })]);
    expect(c.criterios[13]).toEqual({ estado: 'cumple', observacion: 'ok' });
  });
});

describe('exportar evaluación', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PLANTILLA)))));
  afterEach(() => vi.unstubAllGlobals());

  const ev: Evaluacion = {
    ...aplicarCambio(contenidoVacio(), {
      identificacion: { requerimiento: 'Portal <web>', ambiente: 'produccion', fecha: '2026-10-20' },
      criterios: { 13: { estado: 'noCumple', observacion: 'Falta alt' } },
      hallazgos: { h: { criterio: 'SC1.1.1', severidad: 'critica', estado: 'enProceso', fecha: '2026-03-05' } },
      cierre: { herramientas: [5], decision: 'conPlan' },
    }),
    id: 'x', ticket: 7, creado: '', actualizado: '',
  };

  it('escribe en español en las celdas de la plantilla y deja intacto el resto del paquete', async () => {
    const salida = await JSZip.loadAsync(await (await exportarEvaluacion(ev)).arrayBuffer());
    const original = await JSZip.loadAsync(PLANTILLA);
    const hoja = (n: number) => salida.file(`xl/worksheets/sheet${n}.xml`)!.async('string');
    const h1 = await hoja(1);
    expect(h1).toMatch(/<c r="B7"[^>]*><v>7<\/v>/);
    expect(h1).toContain('Portal &lt;web&gt;');
    expect(h1).toContain('>Producción<');
    expect(h1).toMatch(new RegExp(`<c r="B12"[^>]*><v>${serialExcel('2026-10-20')}</v>`));
    expect(await hoja(2)).toContain('>No cumple<');
    const h3 = await hoja(3);
    expect(h3).toContain('>Crítica<');
    expect(h3).toContain('>5/3/2026<');
    const h4 = await hoja(4);
    expect(h4).toMatch(/<c r="A5"[^>]* t="b"><v>1<\/v>/);
    expect(h4).toMatch(/<c r="A4"[^>]* t="b"><v>0<\/v>/);
    expect(h4).toContain('>Autoriza con plan de mejora registrado<');
    for (const nombre of Object.keys(original.files)) {
      if (/worksheets\/sheet[1-4]\.xml$/.test(nombre) || original.files[nombre].dir) continue;
      expect(await salida.file(nombre)!.async('string'), nombre).toBe(await original.file(nombre)!.async('string'));
    }
  });

  it('convierte fechas al número de serie de Excel', () => {
    expect(serialExcel('2026-10-20')).toBe(46315);
    expect(serialExcel('')).toBe('');
  });
});
