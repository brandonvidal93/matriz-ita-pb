import { Registro } from '../app/core/modelos';

/** Registro mínimo para pruebas; se sobrescriben los campos que interesen. */
export function registroDePrueba(datos: Partial<Registro> = {}): Registro {
  return {
    id: 'reg-1',
    nombre: 'ITA 2026 – Prueba',
    tipo: 'procuraduria',
    vigencia: 2026,
    versionMatriz: 'ITA 2023',
    creado: '2026-01-01T00:00:00.000Z',
    actualizado: '2026-01-01T00:00:00.000Z',
    respuestas: {},
    evidencias: [],
    formatoEvidencias: 'url',
    ...datos,
  };
}
