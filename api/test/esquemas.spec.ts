import { CambioRespuestas, Clave, ContenidoRegistro, EvidenciaEntrada, FILAS_VALIDAS, NuevoUsuario, Respaldo } from '../src/esquemas';

const fila = [...FILAS_VALIDAS][0]!;

describe('Clave', () => {
  it.each([
    ['corta1', false],
    ['soloLetrasLargas', false],
    ['12345678901', false],
    ['clave-segura-2026', true],
    ['Contraseña2026', true],
  ])('%s → %s', (c, ok) => expect(Clave.safeParse(c).success).toBe(ok));
});

describe('NuevoUsuario', () => {
  it('normaliza el usuario a minúsculas y valida el formato', () => {
    expect(NuevoUsuario.parse({ usuario: ' JPerez ', nombre: 'Juan', rol: 'editor', clave: 'clave-segura-1' }).usuario).toBe('jperez');
    expect(NuevoUsuario.safeParse({ usuario: 'a b', nombre: 'X', rol: 'editor', clave: 'clave-segura-1' }).success).toBe(false);
    expect(NuevoUsuario.safeParse({ usuario: 'abc', nombre: 'X', rol: 'root', clave: 'clave-segura-1' }).success).toBe(false);
  });
});

describe('EvidenciaEntrada', () => {
  it('solo acepta URLs http(s)', () => {
    expect(EvidenciaEntrada.safeParse({ id: 'e1', url: 'https://x.co/a' }).success).toBe(true);
    expect(EvidenciaEntrada.safeParse({ id: 'e1', url: 'javascript:alert(1)' }).success).toBe(false);
    expect(EvidenciaEntrada.safeParse({ id: 'e1', url: 'ftp://x.co' }).success).toBe(false);
  });

  it('rechaza ids con caracteres extraños', () => {
    expect(EvidenciaEntrada.safeParse({ id: "e1'; DROP", url: 'https://x.co' }).success).toBe(false);
  });
});

describe('CambioRespuestas', () => {
  it('exige filas de la matriz y al menos un cambio', () => {
    expect(CambioRespuestas.safeParse({ filas: [fila], cambios: { estado: 'SI' } }).success).toBe(true);
    expect(CambioRespuestas.safeParse({ filas: [fila], cambios: { estado: null } }).success).toBe(true);
    expect(CambioRespuestas.safeParse({ filas: [99999], cambios: { estado: 'SI' } }).success).toBe(false);
    expect(CambioRespuestas.safeParse({ filas: [], cambios: { estado: 'SI' } }).success).toBe(false);
    expect(CambioRespuestas.safeParse({ filas: [fila], cambios: {} }).success).toBe(false);
    expect(CambioRespuestas.safeParse({ filas: [fila], cambios: { estado: 'TALVEZ' } }).success).toBe(false);
  });
});

describe('ContenidoRegistro', () => {
  it('rechaza respuestas en filas que no existen', () => {
    const r = ContenidoRegistro.safeParse({ respuestas: { '1': { estado: 'SI' } }, evidencias: [] });
    expect(r.success).toBe(false);
  });

  it('completa valores por defecto de una respuesta', () => {
    const r = ContenidoRegistro.parse({ respuestas: { [fila]: { estado: 'NO' } }, evidencias: [] });
    expect(r.respuestas[String(fila)]).toEqual({ estado: 'NO', observacion: '', evidencias: [] });
  });
});

describe('Respaldo', () => {
  const reg = { id: 'r1', nombre: 'R', tipo: 'procuraduria', vigencia: 2025, respuestas: {}, evidencias: [] };

  it('acepta el archivo de datos completo', () => {
    expect(Respaldo.parse({ app: 'matriz-ita', formato: 1, registros: [reg] }).registros).toHaveLength(1);
  });

  it('acepta el respaldo de un solo registro', () => {
    expect(Respaldo.parse(reg).registros[0]!.id).toBe('r1');
  });

  it('rechaza otros JSON', () => {
    expect(Respaldo.safeParse({ hola: 1 }).success).toBe(false);
  });
});
