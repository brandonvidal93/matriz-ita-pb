import type { Evaluacion } from '../../src/app/formatos/accesibilidad/modelo';
import { Entorno, conBase, prepararEntorno } from './ayudas';

conBase('matriz de accesibilidad (MySQL)', () => {
  let e: Entorno;
  beforeAll(async () => {
    e = await prepararEntorno();
    await e.db.query("INSERT INTO usuario_formatos SELECT id, 'accesibilidad', IF(rol = 'lector', 'ver', 'editar') FROM usuarios WHERE rol <> 'admin'");
  });
  afterAll(() => e?.cerrar());

  const pedir = (method: string, url: string, rol: keyof Entorno['cookies'] = 'editor', payload?: unknown) =>
    e.app.inject({ method: method as any, url, payload: payload as any, headers: { cookie: e.cookies[rol] } });
  const obtener = async (id: string) => (await pedir('GET', `/api/accesibilidad/${id}`)).json() as Evaluacion;

  let id: string;

  it('crea evaluaciones con un ticket consecutivo', async () => {
    const a = (await pedir('POST', '/api/accesibilidad', 'editor', {})).json() as Evaluacion;
    const b = await pedir('POST', '/api/accesibilidad', 'editor', {});
    expect(b.statusCode).toBe(201);
    expect(b.json().ticket).toBe(a.ticket + 1);
    expect(a).toMatchObject({ criterios: {}, hallazgos: [], identificacion: { requerimiento: '' } });
    id = a.id;
  });

  it('mezcla cambios parciales sin perder los anteriores', async () => {
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { identificacion: { requerimiento: 'Portal', ambiente: 'produccion' } });
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { identificacion: { url: 'https://x.co' }, criterios: { 13: { estado: 'noCumple' } } });
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { criterios: { 13: { observacion: 'Falta alt' } } });
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { c13: { accion: 'Agregar alt', severidad: 'alta' }, c14: { hallazgo: 'Otro' } } });
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { c13: { estado: 'pendiente' }, c14: null } });
    const ev = await obtener(id);
    expect(ev.identificacion).toMatchObject({ requerimiento: 'Portal', ambiente: 'produccion', url: 'https://x.co' });
    expect(ev.criterios[13]).toEqual({ estado: 'noCumple', observacion: 'Falta alt', evidencias: [], notaInterna: '' });
    expect(ev.hallazgos).toEqual([expect.objectContaining({ id: 'c13', hallazgo: null, accion: 'Agregar alt', severidad: 'alta', estado: 'pendiente' })]);
  });

  it('evidencias: biblioteca, asignación a criterios y hallazgos, nota interna y borrado', async () => {
    const url = `/api/accesibilidad/${id}`;
    await pedir('PATCH', url, 'editor', { evidencias: { e1: { titulo: 'Captura', url: 'https://drive.google.com/x' } } });
    await pedir('PATCH', url, 'editor', { asignar: { evidencia: 'e1', criterios: [13, 14], hallazgos: ['c13'] } });
    await pedir('PATCH', url, 'editor', { criterios: { 13: { notaInterna: 'revisar' } }, formatoEvidencias: 'titulo-url' });
    let ev = await obtener(id);
    expect(ev.evidencias).toEqual([expect.objectContaining({ id: 'e1', url: 'https://drive.google.com/x' })]);
    expect(ev.criterios[13]).toMatchObject({ evidencias: ['e1'], notaInterna: 'revisar', observacion: 'Falta alt' });
    expect(ev.criterios[14]!.evidencias).toEqual(['e1']);
    expect(ev.hallazgos[0]!.evidencias).toEqual(['e1']);
    expect(ev.formatoEvidencias).toBe('titulo-url');

    await pedir('PATCH', url, 'editor', { quitar: { evidencia: 'e1', criterios: [14] } });
    expect((await obtener(id)).criterios[14]!.evidencias).toEqual([]);
    // Asignar una evidencia que no existe no hace nada.
    await pedir('PATCH', url, 'editor', { asignar: { evidencia: 'zz', criterios: [14] } });
    expect((await obtener(id)).criterios[14]!.evidencias).toEqual([]);

    expect((await pedir('PATCH', url, 'editor', { evidencias: { e2: { titulo: 'Sin URL' } } })).statusCode).toBe(400);
    expect((await pedir('PATCH', url, 'editor', { evidencias: { e2: { url: 'ftp://x' } } })).statusCode).toBe(400);

    await pedir('PATCH', url, 'editor', { evidencias: { e1: null } });
    ev = await obtener(id);
    expect(ev.evidencias).toEqual([]);
    expect(ev.criterios[13]!.evidencias).toEqual([]);
    expect(ev.hallazgos[0]!.evidencias).toEqual([]);
  });

  it('no pierde cambios simultáneos sobre la misma evaluación', async () => {
    const filas = [14, 15, 16, 17, 18, 19, 20, 21];
    await Promise.all(filas.map((f) => pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { criterios: { [f]: { estado: 'cumple' } } })));
    const ev = await obtener(id);
    for (const f of filas) expect(ev.criterios[f]?.estado).toBe('cumple');
  });

  it('valida las entradas', async () => {
    const malos = await Promise.all([
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { criterios: { 12: { estado: 'cumple' } } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { identificacion: { ambiente: 'otro' } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { c13: { criterio: 'SC9.9.9' } } }),
      // Los hallazgos son uno por criterio: el id es c<fila>.
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { h3: { accion: 'x' } } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { c12: { accion: 'x' } } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { asignar: { evidencia: 'e1', hallazgos: ['no-existe'] } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { cierre: { fecha: '31/12/2026' } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { otro: 1 }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', {}),
    ]);
    for (const r of malos) expect(r.statusCode).toBe(400);
    expect((await pedir('PATCH', '/api/accesibilidad/no-existe', 'editor', { cierre: { cargo: 'x' } })).statusCode).toBe(404);
  });

  it('respaldo: descarga todo y la restauración no duplica lo ya cargado', async () => {
    const respaldo = (await pedir('GET', '/api/accesibilidad/respaldo', 'lector')).json();
    expect(respaldo).toMatchObject({ app: 'matriz-accesibilidad', formato: 1 });
    const n = respaldo.evaluaciones.length;
    expect(n).toBeGreaterThan(0);
    expect((await pedir('POST', '/api/accesibilidad/respaldo', 'editor', respaldo)).statusCode).toBe(403);
    const r = (await pedir('POST', '/api/accesibilidad/respaldo', 'admin', respaldo)).json();
    expect(r).toMatchObject({ creados: [], omitidos: { length: n } });

    // Otra fecha de modificación: se crea como copia con id y ticket nuevos.
    const orig = respaldo.evaluaciones.find((x: Evaluacion) => x.id === id);
    const r2 = (await pedir('POST', '/api/accesibilidad/respaldo', 'admin', { evaluaciones: [{ ...orig, actualizado: new Date(0).toISOString() }] })).json();
    expect(r2.creados).toHaveLength(1);
    const copia = await obtener(r2.creados[0].id);
    expect(copia.id).not.toBe(id);
    expect(copia.ticket).not.toBe(orig.ticket);
    expect(copia.criterios[13]).toEqual(orig.criterios[13]);

    // Id nuevo con un ticket libre: lo conserva. Lo que falte se completa.
    const r3 = (await pedir('POST', '/api/accesibilidad/respaldo', 'admin', { evaluaciones: [{ id: 'migrada-1', ticket: 9000, criterios: { 14: { estado: 'cumple' } } }] })).json();
    const m = await obtener(r3.creados[0].id);
    expect(m).toMatchObject({ id: 'migrada-1', ticket: 9000, hallazgos: [], criterios: { 14: { estado: 'cumple', observacion: '', evidencias: [] } } });
    expect((await pedir('POST', '/api/accesibilidad/respaldo', 'admin', { evaluaciones: [{ id: 'x', criterios: { 12: {} } }] })).statusCode).toBe(400);
  });

  it('respeta los permisos del formato', async () => {
    expect((await pedir('GET', '/api/accesibilidad', 'lector')).statusCode).toBe(200);
    expect((await pedir('PATCH', `/api/accesibilidad/${id}`, 'lector', { cierre: { cargo: 'x' } })).statusCode).toBe(403);
    expect((await pedir('POST', '/api/accesibilidad', 'lector', {})).statusCode).toBe(403);
    expect((await pedir('DELETE', `/api/accesibilidad/${id}`, 'editor')).statusCode).toBe(403);
    await e.db.query("DELETE FROM usuario_formatos WHERE formato = 'accesibilidad'");
    expect((await pedir('GET', '/api/accesibilidad', 'editor')).statusCode).toBe(403);
    await e.db.query("INSERT INTO usuario_formatos SELECT id, 'accesibilidad', IF(rol = 'lector', 'ver', 'editar') FROM usuarios WHERE rol <> 'admin'");
  });

  it('el administrador elimina y queda una copia en el historial', async () => {
    expect((await pedir('DELETE', `/api/accesibilidad/${id}`, 'admin')).statusCode).toBe(204);
    expect((await pedir('GET', `/api/accesibilidad/${id}`)).statusCode).toBe(404);
    const [copia] = await e.db.query<any[]>("SELECT detalle FROM auditoria WHERE accion = 'accesibilidad-eliminada-copia' AND registro_id = ?", [id]);
    expect(copia[0].detalle.criterios[13].observacion).toBe('Falta alt');
  });
});
