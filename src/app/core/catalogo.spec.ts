import { CATALOGO, ITEM_POR_FILA, SECCIONES, etiquetaCorta, problemas, textoObservacion } from './catalogo';
import { ItemCatalogo, Registro, Respuesta } from './modelos';
import { registroDePrueba } from '../../testing/fabricas';

const cumplimiento = CATALOGO.items.find((i) => i.tipo === 'cumplimiento')!;
const numero: ItemCatalogo = { ...cumplimiento, tipo: 'numero' };
const resp = (r: Partial<Respuesta>): Respuesta => ({ estado: null, observacion: '', evidencias: [], ...r });

describe('CATALOGO', () => {
  it('tiene los 270 ítems de la matriz ITA 2023 con filas únicas', () => {
    expect(CATALOGO.version).toBe('ITA 2023');
    expect(CATALOGO.items.length).toBe(270);
    expect(new Set(CATALOGO.items.map((i) => i.fila)).size).toBe(270);
  });

  it('agrupa todos los ítems en secciones sin perder ninguno', () => {
    const total = SECCIONES.reduce((n, s) => n + s.items.length, 0);
    expect(total).toBe(CATALOGO.items.length);
    expect(new Set(SECCIONES.map((s) => s.clave)).size).toBe(SECCIONES.length);
  });

  it('indexa los ítems por fila', () => {
    expect(ITEM_POR_FILA.get(cumplimiento.fila)).toBe(cumplimiento);
  });
});

describe('etiquetaCorta', () => {
  it('recorta textos largos con elipsis y normaliza espacios', () => {
    const it: ItemCatalogo = { ...cumplimiento, item: 'a  b\n' + 'x'.repeat(200) };
    const t = etiquetaCorta(it, 20);
    expect(t.length).toBe(20);
    expect(t.endsWith('…')).toBe(true);
    expect(t.startsWith('a b x')).toBe(true);
  });

  it('deja intactos los textos cortos', () => {
    expect(etiquetaCorta({ ...cumplimiento, item: 'Corto' })).toBe('Corto');
  });
});

describe('problemas', () => {
  it('marca sin-estado cuando no hay respuesta', () => {
    expect(problemas(cumplimiento, undefined)).toEqual(['sin-estado']);
    expect(problemas(cumplimiento, resp({}))).toEqual(['sin-estado']);
  });

  it('SI sin evidencia ni observación es sin-soporte', () => {
    expect(problemas(cumplimiento, resp({ estado: 'SI' }))).toEqual(['sin-soporte']);
  });

  it('SI con evidencia o con observación no tiene problemas', () => {
    expect(problemas(cumplimiento, resp({ estado: 'SI', evidencias: ['e1'] }))).toEqual([]);
    expect(problemas(cumplimiento, resp({ estado: 'SI', observacion: 'Ver acta' }))).toEqual([]);
  });

  it('NA y NO exigen texto (espacios no cuentan)', () => {
    expect(problemas(cumplimiento, resp({ estado: 'NA', observacion: '   ' }))).toEqual(['na-sin-justificacion']);
    expect(problemas(cumplimiento, resp({ estado: 'NO' }))).toEqual(['no-sin-justificacion']);
    expect(problemas(cumplimiento, resp({ estado: 'NA', observacion: 'Ley X' }))).toEqual([]);
  });

  it('ítems numéricos solo requieren la observación', () => {
    expect(problemas(numero, resp({ estado: 'SI' }))).toEqual(['sin-estado']);
    expect(problemas(numero, resp({ observacion: '12' }))).toEqual([]);
  });
});

describe('textoObservacion', () => {
  const reg: Registro = registroDePrueba({
    evidencias: [
      { id: 'e1', titulo: 'Acta', url: 'https://a.co/acta.pdf' },
      { id: 'e2', titulo: '', url: 'https://a.co/b' },
    ],
  });

  it('une observación y URLs en el orden de las evidencias', () => {
    const r = resp({ observacion: '  Nota  ', evidencias: ['e2', 'e1'] });
    expect(textoObservacion(r, reg)).toBe('Nota\nhttps://a.co/b\nhttps://a.co/acta.pdf');
  });

  it('usa "título: url" cuando el formato lo pide y hay título', () => {
    const r = resp({ evidencias: ['e1', 'e2'] });
    expect(textoObservacion(r, { ...reg, formatoEvidencias: 'titulo-url' })).toBe('Acta: https://a.co/acta.pdf\nhttps://a.co/b');
  });

  it('ignora evidencias que ya no existen y respuestas vacías', () => {
    expect(textoObservacion(resp({ evidencias: ['borrada'] }), reg)).toBe('');
    expect(textoObservacion(undefined, reg)).toBe('');
  });
});
