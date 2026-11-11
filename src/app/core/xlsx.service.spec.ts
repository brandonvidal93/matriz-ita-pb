import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';
import { CATALOGO } from './catalogo';
import { XlsxService } from './xlsx.service';
import { registroDePrueba } from '../../testing/fabricas';

const PLANTILLA = readFileSync(resolve(process.cwd(), 'public/plantilla/matriz-ita-2023.xlsx'));
const HOJA = 'xl/worksheets/' + CATALOGO.hoja;
const [a, b, c] = CATALOGO.items.filter((i) => i.tipo === 'cumplimiento');

/** El servicio usa `fetch` para la plantilla; en pruebas se sirve desde disco. */
function servirPlantilla() {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array(PLANTILLA))));
}

const registro = registroDePrueba({
  evidencias: [
    { id: 'e1', titulo: 'Acta', url: 'https://www.pascualbravo.edu.co/acta.pdf' },
    { id: 'e2', titulo: 'Política', url: 'https://www.pascualbravo.edu.co/politica?x=1&y=2' },
  ],
  respuestas: {
    [a.fila]: { estado: 'SI', observacion: 'Publicado <en> portal', evidencias: ['e1', 'e2'] },
    [b.fila]: { estado: 'NA', observacion: 'No aplica por Ley 1712', evidencias: [] },
    [c.fila]: { estado: 'NO', observacion: 'En construcción', evidencias: [], notaInterna: 'secreto interno' },
  },
});

describe('XlsxService', () => {
  const svc = new XlsxService();
  beforeEach(servirPlantilla);
  afterEach(() => vi.unstubAllGlobals());

  it('exporta sin modificar ningún archivo del paquete salvo la hoja y sus vínculos', async () => {
    const blob = await svc.exportar(registro);
    const salida = await JSZip.loadAsync(await blob.arrayBuffer());
    const original = await JSZip.loadAsync(PLANTILLA);

    expect(Object.keys(salida.files).sort()).toEqual(Object.keys(original.files).sort());
    for (const nombre of Object.keys(original.files)) {
      if (nombre === HOJA || nombre.endsWith('sheet1.xml.rels') || original.files[nombre].dir) continue;
      expect(await salida.file(nombre)!.async('string'), nombre).toBe(await original.file(nombre)!.async('string'));
    }
  });

  it('escribe X en la columna del estado, escapa XML y no exporta notas internas', async () => {
    const hoja = await (await JSZip.loadAsync(await (await svc.exportar(registro)).arrayBuffer())).file(HOJA)!.async('string');
    expect(hoja).toContain(`<c r="F${a.fila}"`);
    expect(hoja).toContain(`<c r="H${b.fila}"`);
    expect(hoja).toContain(`<c r="G${c.fila}"`);
    expect(hoja).toContain('Publicado &lt;en&gt; portal');
    expect(hoja).not.toContain('secreto interno');
    expect(hoja).toMatch(new RegExp(`<hyperlink ref="I${a.fila}" r:id="rIdITA1"/>`));
  });

  it('ida y vuelta: lo exportado se vuelve a importar igual', async () => {
    const blob = await svc.exportar(registro);
    const res = await svc.importar(blob);

    expect(res.advertencias).toEqual([]);
    expect(res.itemsLeidos).toBe(3);
    expect(res.evidencias.map((e) => e.url).sort()).toEqual(registro.evidencias.map((e) => e.url).sort());
    expect(res.respuestas[a.fila]).toMatchObject({ estado: 'SI', observacion: 'Publicado <en> portal' });
    expect(res.respuestas[a.fila].evidencias).toHaveLength(2);
    expect(res.respuestas[b.fila]).toMatchObject({ estado: 'NA', observacion: 'No aplica por Ley 1712', evidencias: [] });
    expect(res.respuestas[c.fila]).toMatchObject({ estado: 'NO', observacion: 'En construcción' });
  });

  it('la plantilla en blanco no trae respuestas', async () => {
    const res = await svc.importar(new Blob([new Uint8Array(PLANTILLA)]));
    expect(res.itemsLeidos).toBe(0);
    expect(res.evidencias).toEqual([]);
  });

  it('rechaza archivos que no son la matriz', async () => {
    const zip = new JSZip();
    zip.file('otro.txt', 'x');
    await expect(svc.importar(await zip.generateAsync({ type: 'blob' }))).rejects.toThrow(/estructura de la Matriz ITA/);
  });

  it('falla con mensaje claro si no encuentra la plantilla', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await expect(svc.exportar(registro)).rejects.toThrow(/plantilla oficial/);
  });
});
