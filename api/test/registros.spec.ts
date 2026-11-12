import type { Registro } from '../../src/app/core/modelos';
import { FILAS_VALIDAS } from '../src/formatos/ita/esquemas';
import { Entorno, conBase, prepararEntorno } from './ayudas';

const [f1, f2, f3] = [...FILAS_VALIDAS];

conBase('registros, respuestas y evidencias (MySQL)', () => {
  let e: Entorno;
  beforeAll(async () => (e = await prepararEntorno()));
  afterAll(() => e?.cerrar());

  const pedir = (method: string, url: string, rol: keyof Entorno['cookies'] = 'editor', payload?: unknown) =>
    e.app.inject({ method: method as any, url, payload: payload as any, headers: { cookie: e.cookies[rol] } });
  const obtener = async (id: string) => (await pedir('GET', `/api/registros/${id}`)).json() as Registro;

  let id: string;

  it('el editor crea un registro vacío', async () => {
    const r = await pedir('POST', '/api/registros', 'editor', { nombre: 'ITA 2026', tipo: 'procuraduria', vigencia: 2026 });
    expect(r.statusCode).toBe(201);
    const reg = r.json() as Registro;
    expect(reg).toMatchObject({ nombre: 'ITA 2026', versionMatriz: 'ITA 2023', respuestas: {}, evidencias: [], formatoEvidencias: 'url' });
    id = reg.id;
  });

  it('el lector puede consultar pero no modificar', async () => {
    expect((await pedir('GET', '/api/registros', 'lector')).json()).toHaveLength(1);
    const intentos = await Promise.all([
      pedir('POST', '/api/registros', 'lector', { nombre: 'X', tipo: 'procuraduria', vigencia: 2026 }),
      pedir('PATCH', `/api/registros/${id}`, 'lector', { nombre: 'X' }),
      pedir('PATCH', `/api/registros/${id}/respuestas`, 'lector', { filas: [f1], cambios: { estado: 'SI' } }),
      pedir('DELETE', `/api/registros/${id}`, 'lector'),
    ]);
    for (const r of intentos) expect(r.statusCode).toBe(403);
  });

  it('valida los datos de entrada', async () => {
    const malos = await Promise.all([
      pedir('POST', '/api/registros', 'editor', { nombre: '', tipo: 'procuraduria', vigencia: 2026 }),
      pedir('PATCH', `/api/registros/${id}/respuestas`, 'editor', { filas: [1], cambios: { estado: 'SI' } }),
      pedir('POST', `/api/registros/${id}/evidencias`, 'editor', { id: 'e1', url: 'javascript:alert(1)' }),
    ]);
    for (const r of malos) {
      expect(r.statusCode).toBe(400);
      expect(r.json().error).toMatch(/Datos inválidos/);
    }
  });

  it('actualiza respuestas por ítem sin pisar otros campos (edición concurrente)', async () => {
    // Dos personas editan campos distintos del mismo ítem "a la vez".
    await Promise.all([
      pedir('PATCH', `/api/registros/${id}/respuestas`, 'editor', { filas: [f1], cambios: { estado: 'NA' } }),
      pedir('PATCH', `/api/registros/${id}/respuestas`, 'admin', { filas: [f1], cambios: { observacion: 'No aplica por ley' } }),
      pedir('PATCH', `/api/registros/${id}/respuestas`, 'editor', { filas: [f2, f3], cambios: { estado: 'SI', notaInterna: 'revisar' } }),
    ]);
    const reg = await obtener(id);
    expect(reg.respuestas[f1]).toMatchObject({ estado: 'NA', observacion: 'No aplica por ley' });
    expect(reg.respuestas[f2]).toMatchObject({ estado: 'SI', notaInterna: 'revisar' });
    expect(reg.respuestas[f3]).toMatchObject({ estado: 'SI' });

    await pedir('PATCH', `/api/registros/${id}/respuestas`, 'editor', { filas: [f3], cambios: { estado: null } });
    expect((await obtener(id)).respuestas[f3]!.estado).toBeNull();
  });

  it('evidencias: deduplica por URL, asigna en orden y quita', async () => {
    const a = await pedir('POST', `/api/registros/${id}/evidencias`, 'editor', { id: 'ev-a', titulo: 'Acta', url: ' https://pb.edu.co/acta.pdf. ' });
    expect(a.statusCode).toBe(201);
    expect(a.json().url).toBe('https://pb.edu.co/acta.pdf');
    const dup = await pedir('POST', `/api/registros/${id}/evidencias`, 'editor', { id: 'ev-z', url: 'https://pb.edu.co/acta.pdf' });
    expect(dup.statusCode).toBe(200);
    expect(dup.json().id).toBe('ev-a');
    await pedir('POST', `/api/registros/${id}/evidencias`, 'editor', { id: 'ev-b', url: 'https://pb.edu.co/b' });

    await pedir('POST', `/api/registros/${id}/evidencias/ev-b/asignar`, 'editor', { filas: [f2] });
    await pedir('POST', `/api/registros/${id}/evidencias/ev-a/asignar`, 'editor', { filas: [f2, f3] });
    await pedir('POST', `/api/registros/${id}/evidencias/ev-a/asignar`, 'editor', { filas: [f2] }); // idempotente
    let reg = await obtener(id);
    expect(reg.evidencias.map((x) => x.id)).toEqual(['ev-a', 'ev-b']);
    expect(reg.respuestas[f2]!.evidencias).toEqual(['ev-b', 'ev-a']);
    expect(reg.respuestas[f3]!.evidencias).toEqual(['ev-a']);

    await pedir('POST', `/api/registros/${id}/evidencias/ev-a/quitar`, 'editor', { filas: [f2] });
    reg = await obtener(id);
    expect(reg.respuestas[f2]!.evidencias).toEqual(['ev-b']);
    expect(reg.respuestas[f3]!.evidencias).toEqual(['ev-a']);
  });

  it('evidencias: edita, verifica, impide URL duplicada y al borrar la quita de los ítems', async () => {
    const v = { fecha: new Date().toISOString(), estado: 'ok' };
    const r = await pedir('PATCH', `/api/registros/${id}/evidencias/ev-b`, 'editor', { titulo: 'Política', verificacion: v });
    expect(r.json()).toMatchObject({ titulo: 'Política', verificacion: { estado: 'ok' } });
    expect((await pedir('PATCH', `/api/registros/${id}/evidencias/ev-b`, 'editor', { url: 'https://pb.edu.co/acta.pdf' })).statusCode).toBe(409);
    expect((await pedir('PATCH', `/api/registros/${id}/evidencias/no-existe`, 'editor', { titulo: 'x' })).statusCode).toBe(404);

    expect((await pedir('DELETE', `/api/registros/${id}/evidencias/ev-b`)).statusCode).toBe(204);
    const reg = await obtener(id);
    expect(reg.evidencias.map((x) => x.id)).toEqual(['ev-a']);
    expect(reg.respuestas[f2]!.evidencias).toEqual([]);
  });

  it('copia un registro desde otro sin heredar la verificación de enlaces', async () => {
    await pedir('PATCH', `/api/registros/${id}/evidencias/ev-a`, 'editor', { verificacion: { fecha: new Date().toISOString(), estado: 'error' } });
    const r = await pedir('POST', '/api/registros', 'editor', { nombre: 'Seguimiento', tipo: 'seguimiento', vigencia: 2026, periodo: '1.er semestre', baseId: id });
    expect(r.statusCode).toBe(201);
    const copia = r.json() as Registro;
    const original = await obtener(id);
    expect(copia.id).not.toBe(id);
    expect(copia.respuestas[f1]).toMatchObject({ estado: 'NA', observacion: 'No aplica por ley' });
    expect(copia.respuestas[f3]!.evidencias).toEqual(['ev-a']);
    expect(copia.evidencias[0]!.verificacion).toBeUndefined();
    expect(original.evidencias[0]!.verificacion?.estado).toBe('error');
  });

  it('crea un registro desde contenido importado de un .xlsx', async () => {
    const r = await pedir('POST', '/api/registros', 'editor', {
      nombre: 'Importado',
      tipo: 'procuraduria',
      vigencia: 2025,
      contenido: {
        evidencias: [
          { id: 'x1', titulo: 'A', url: 'https://a.co/1' },
          { id: 'x2', titulo: 'A bis', url: 'https://a.co/1' }, // misma URL: se fusiona
        ],
        respuestas: { [f1]: { estado: 'SI', evidencias: ['x1', 'x2'] } },
      },
    });
    expect(r.statusCode).toBe(201);
    const reg = r.json() as Registro;
    expect(reg.evidencias).toHaveLength(1);
    expect(reg.respuestas[f1]!.evidencias).toEqual(['x1']);
  });

  it('modifica los datos del registro y lleva la auditoría', async () => {
    const r = await pedir('PATCH', `/api/registros/${id}`, 'editor', { nombre: 'ITA 2026 – Final', formatoEvidencias: 'titulo-url' });
    expect(r.json()).toMatchObject({ nombre: 'ITA 2026 – Final', formatoEvidencias: 'titulo-url' });
    expect((await pedir('GET', `/api/registros/${id}/historial`, 'editor')).statusCode).toBe(403);
    const h = (await pedir('GET', `/api/registros/${id}/historial`, 'admin')).json() as { usuario: string; accion: string }[];
    expect(h[0]).toMatchObject({ usuario: 'editor', accion: 'registro-modificado' });
    expect(h.map((x) => x.accion)).toEqual(expect.arrayContaining(['registro-creado', 'respuestas', 'evidencia-agregada', 'evidencia-asignada']));
  });

  it('respaldo: descarga todo y la restauración no duplica lo ya cargado', async () => {
    const respaldo = (await pedir('GET', '/api/respaldo', 'lector')).json();
    expect(respaldo).toMatchObject({ app: 'matriz-ita', formato: 1 });
    expect(respaldo.registros).toHaveLength(3);

    expect((await pedir('POST', '/api/respaldo', 'editor', respaldo)).statusCode).toBe(403);
    const r = await pedir('POST', '/api/respaldo', 'admin', respaldo);
    expect(r.json()).toMatchObject({ creados: [], omitidos: expect.arrayContaining([expect.objectContaining({ motivo: 'Ya estaba cargado' })]) });

    // Un registro del antiguo archivo local que no existe se crea con el mismo id.
    const viejo = { ...respaldo.registros[0], id: 'local-123', nombre: 'Desde archivo local' };
    const r2 = await pedir('POST', '/api/respaldo', 'admin', viejo);
    expect(r2.json().creados).toEqual([{ id: 'local-123', nombre: 'Desde archivo local' }]);
    expect((await obtener('local-123')).respuestas).toEqual(viejo.respuestas);
  });

  it('solo el administrador elimina, y queda copia en la auditoría', async () => {
    expect((await pedir('DELETE', `/api/registros/${id}`, 'editor')).statusCode).toBe(403);
    expect((await pedir('DELETE', `/api/registros/${id}`, 'admin')).statusCode).toBe(204);
    expect((await pedir('GET', `/api/registros/${id}`)).statusCode).toBe(404);
    expect((await pedir('PATCH', `/api/registros/${id}/respuestas`, 'editor', { filas: [f1], cambios: { estado: 'SI' } })).statusCode).toBe(404);
    const [[copia]] = await e.db.query<any[]>("SELECT detalle FROM auditoria WHERE accion = 'registro-eliminado-copia' AND registro_id = ?", [id]);
    expect(copia.detalle.nombre).toBe('ITA 2026 – Final');
    const [[n]] = await e.db.query<any[]>('SELECT COUNT(*) AS n FROM respuestas WHERE registro_id = ?', [id]);
    expect(n.n).toBe(0);
  });
});
