import { CATALOGO } from './catalogo';
import { nombreArchivo, progreso } from './progreso';
import { registroDePrueba } from '../../testing/fabricas';

const [a, b, c, d] = CATALOGO.items.filter((i) => i.tipo === 'cumplimiento');

describe('progreso', () => {
  it('registro vacío: 0 % y todos pendientes', () => {
    const p = progreso(registroDePrueba());
    expect(p).toMatchObject({ total: 270, diligenciados: 0, si: 0, no: 0, na: 0, porcentaje: 0 });
    expect(p.conProblemas).toBe(270);
  });

  it('cuenta estados y problemas sobre un subconjunto de ítems', () => {
    const reg = registroDePrueba({
      respuestas: {
        [a.fila]: { estado: 'SI', observacion: '', evidencias: ['e1'] },
        [b.fila]: { estado: 'SI', observacion: '', evidencias: [] }, // sin soporte
        [c.fila]: { estado: 'NA', observacion: 'Ley 1712', evidencias: [] },
        [d.fila]: { estado: 'NO', observacion: '', evidencias: [] }, // sin justificación
      },
    });
    const p = progreso(reg, [a, b, c, d]);
    expect(p).toEqual({ total: 4, diligenciados: 4, si: 2, no: 1, na: 1, conProblemas: 2, porcentaje: 100 });
  });

  it('lista vacía no divide por cero', () => {
    expect(progreso(registroDePrueba(), []).porcentaje).toBe(0);
  });
});

describe('nombreArchivo', () => {
  it('quita tildes y caracteres no válidos', () => {
    const n = nombreArchivo(registroDePrueba({ nombre: 'ITA 2026 – Reporte Procuraduría' }), 'xlsx');
    expect(n).toMatch(/^Matriz_ITA_ITA_2026_Reporte_Procuraduria_\d{4}-\d{2}-\d{2}\.xlsx$/);
  });
});
