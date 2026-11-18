import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { exportarEvaluacion, serialExcel } from './exportar';
import { CATALOGO_ACC, consolidado, hallazgosGenerados } from './catalogo';
import { Evaluacion, Nivel, aplicarCambio, completar, contenidoVacio, criterioVacio } from './modelo';

const PLANTILLA = readFileSync(resolve(process.cwd(), 'public/plantilla/matriz-evaluacion-accesibilidad.xlsx'));
const primero = (n: Nivel) => CATALOGO_ACC.criterios.find((c) => c.nivel === n)!.fila;

/** Todos los criterios con `estado`, salvo los cambios indicados. */
function todos(estado: 'cumple' | 'noAplica', cambios: Record<number, 'cumple' | 'noCumple' | 'noAplica'> = {}) {
  return {
    criterios: Object.fromEntries(
      CATALOGO_ACC.criterios.map((c) => [c.fila, { ...criterioVacio(), estado: cambios[c.fila] ?? estado, observacion: 'ok' }]),
    ),
  };
}

describe('consolidado de accesibilidad', () => {
  it('sigue la fórmula de la hoja 2', () => {
    expect(consolidado({ criterios: {} }).nivel).toBe('na');
    expect(consolidado({ criterios: { [primero('A')]: { ...criterioVacio(), estado: 'cumple' } } }).nivel).toBe('na');
    expect(consolidado(todos('noAplica')).nivel).toBe('AA');
    expect(consolidado(todos('noAplica', { [primero('AAA')]: 'cumple' })).nivel).toBe('AAA');
    expect(consolidado(todos('cumple', { [primero('AA')]: 'noCumple' })).nivel).toBe('A');
    expect(consolidado(todos('cumple', { [primero('A')]: 'noCumple', [primero('AA')]: 'noCumple' })).nivel).toBe('noAccesible');
    const c = consolidado(todos('cumple', { [primero('A')]: 'noCumple' }));
    expect(c).toMatchObject({ total: 78, evaluados: 78, noCumple: 1, cumple: 77, conProblemas: 0, porcentaje: 100 });
    // Mismas reglas de revisión que ITA: "No aplica" sin justificación queda por revisar.
    const sinTexto = todos('noAplica');
    sinTexto.criterios[primero('A')]!.observacion = '';
    expect(consolidado(sinTexto).conProblemas).toBe(1);
    expect(c.porNivel.A.total + c.porNivel.AA.total + c.porNivel.AAA.total).toBe(78);
  });

  it('aplica cambios parciales y agrega, modifica y elimina hallazgos', () => {
    let c = aplicarCambio(contenidoVacio(), { hallazgos: { a: { hallazgo: 'uno' }, b: { hallazgo: 'dos' } }, criterios: { 13: { estado: 'cumple' } } });
    c = aplicarCambio(c, { hallazgos: { a: null, b: { severidad: 'alta' } }, criterios: { 13: { observacion: 'ok' } } });
    expect(c.hallazgos).toEqual([expect.objectContaining({ id: 'b', hallazgo: 'dos', severidad: 'alta' })]);
    expect(c.criterios[13]).toMatchObject({ estado: 'cumple', observacion: 'ok' });
  });

  it('asigna, quita y borra evidencias en criterios y hallazgos', () => {
    let c = aplicarCambio(contenidoVacio(), { hallazgos: { h: { hallazgo: 'x' } }, evidencias: { e: { titulo: 'T', url: 'https://x.co' } } });
    c = aplicarCambio(c, { asignar: { evidencia: 'e', criterios: [13, 14], hallazgos: ['h', 'c14'] } });
    expect(c.criterios[13]!.evidencias).toEqual(['e']);
    expect(c.hallazgos.map((h) => [h.id, h.evidencias])).toEqual([['h', ['e']], ['c14', ['e']]]); // c14 se crea al asignar
    c = aplicarCambio(c, { asignar: { evidencia: 'e', criterios: [13] } });
    expect(c.criterios[13]!.evidencias).toEqual(['e']); // sin duplicar
    c = aplicarCambio(c, { quitar: { evidencia: 'e', criterios: [14] } });
    expect(c.criterios[14]!.evidencias).toEqual([]);
    c = aplicarCambio(c, { asignar: { evidencia: 'no-existe', criterios: [14] } });
    expect(c.criterios[14]!.evidencias).toEqual([]);
    c = aplicarCambio(c, { evidencias: { e: null } });
    expect(c.evidencias).toEqual([]);
    expect(c.criterios[13]!.evidencias).toEqual([]);
    expect(c.hallazgos[0]!.evidencias).toEqual([]);
  });

  it('completa contenidos guardados antes de que existieran las evidencias', () => {
    const viejo = { ...contenidoVacio(), criterios: { 13: { estado: 'cumple', observacion: 'x' } }, hallazgos: [{ id: 'h', hallazgo: 'y' }] } as any;
    delete viejo.evidencias;
    const c = completar(viejo);
    expect(c.hallazgos[0]!.hallazgo).toBe('y');
    expect(c.evidencias).toEqual([]);
    expect(c.criterios[13]).toMatchObject({ estado: 'cumple', evidencias: [], notaInterna: '' });
    expect(c.hallazgos[0]).toMatchObject({ hallazgo: 'y', evidencias: [], severidad: '' });
  });
});

describe('hallazgos generados', () => {
  it('uno por criterio en "No cumple", con texto y severidad sugeridos, y conserva el plan al cambiar de estado', () => {
    const [a, aa] = [primero('A'), primero('AA')];
    let c = aplicarCambio(contenidoVacio(), { criterios: { [a]: { estado: 'noCumple', observacion: 'Falta alt' }, [aa]: { estado: 'noCumple' }, [primero('AAA')]: { estado: 'cumple' } } });
    let hs = hallazgosGenerados(c);
    expect(hs.map((h) => [h.id, h.hallazgo, h.severidad, h.sugerida])).toEqual([[`c${a}`, 'Falta alt', 'alta', true], [`c${aa}`, '', 'media', true]]);
    c = aplicarCambio(c, { hallazgos: { [`c${a}`]: { accion: 'Agregar alt', severidad: 'critica', hallazgo: '' } } });
    expect(hallazgosGenerados(c)[0]).toMatchObject({ accion: 'Agregar alt', severidad: 'critica', sugerida: false, hallazgo: '' });
    c = aplicarCambio(c, { criterios: { [a]: { estado: 'cumple' } } });
    expect(hallazgosGenerados(c).map((h) => h.id)).toEqual([`c${aa}`]);
    c = aplicarCambio(c, { criterios: { [a]: { estado: 'noCumple' } } });
    expect(hallazgosGenerados(c)[0]).toMatchObject({ accion: 'Agregar alt', severidad: 'critica' });
  });
});

describe('exportar evaluación', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PLANTILLA)))));
  afterEach(() => vi.unstubAllGlobals());

  const ev: Evaluacion = {
    ...aplicarCambio(contenidoVacio(), {
      identificacion: { requerimiento: 'Portal <web>', ambiente: 'produccion', fecha: '2026-10-20' },
      criterios: { 13: { estado: 'noCumple', observacion: 'Falta alt', notaInterna: 'secreto interno' } },
      hallazgos: { c13: { hallazgo: 'Logo sin alt', severidad: 'critica', estado: 'enProceso', fecha: '2026-03-05' }, viejo: { hallazgo: 'No se exporta' } },
      cierre: { herramientas: [5], decision: 'conPlan', evidencias: 'Carpeta del informe' },
      evidencias: { e: { titulo: 'Captura', url: 'https://drive.google.com/a' } },
    }),
    id: 'x', ticket: 7, creado: '', actualizado: '',
  };
  const conEvidencia = aplicarCambio(ev, { asignar: { evidencia: 'e', criterios: [13], hallazgos: ['c13'] }, formatoEvidencias: 'titulo-url' });

  it('escribe en español en las celdas de la plantilla y deja intacto el resto del paquete', async () => {
    const salida = await JSZip.loadAsync(await (await exportarEvaluacion(conEvidencia)).arrayBuffer());
    const original = await JSZip.loadAsync(PLANTILLA);
    const hoja = (n: number) => salida.file(`xl/worksheets/sheet${n}.xml`)!.async('string');
    const h1 = await hoja(1);
    expect(h1).toMatch(/<c r="B7"[^>]*><v>7<\/v>/);
    expect(h1).toContain('Portal &lt;web&gt;');
    expect(h1).toContain('>Producción<');
    expect(h1).toMatch(new RegExp(`<c r="B12"[^>]*><v>${serialExcel('2026-10-20')}</v>`));
    const h2 = await hoja(2);
    expect(h2).toContain('>No cumple<');
    expect(h2).toContain('Falta alt\nCaptura: https://drive.google.com/a');
    expect(h2).not.toContain('secreto interno');
    const h3 = await hoja(3);
    expect(h3).toContain('>Crítica<');
    expect(h3).toContain('>5/3/2026<');
    expect(h3).toContain('Logo sin alt\nCaptura: https://drive.google.com/a');
    const h4 = await hoja(4);
    expect(h4).toMatch(/<c r="A5"[^>]* t="b"><v>1<\/v>/);
    expect(h4).toMatch(/<c r="A4"[^>]* t="b"><v>0<\/v>/);
    expect(h4).toContain('>Autoriza con plan de mejora registrado<');
    expect(h4).toContain('Carpeta del informe\nCaptura: https://drive.google.com/a');
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
