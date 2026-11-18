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
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { h1: { criterio: 'SC1.1.1', severidad: 'alta' }, h2: { hallazgo: 'Otro' } } });
    await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { h1: { estado: 'pendiente' }, h2: null } });
    const ev = await obtener(id);
    expect(ev.identificacion).toMatchObject({ requerimiento: 'Portal', ambiente: 'produccion', url: 'https://x.co' });
    expect(ev.criterios[13]).toEqual({ estado: 'noCumple', observacion: 'Falta alt' });
    expect(ev.hallazgos).toEqual([expect.objectContaining({ id: 'h1', criterio: 'SC1.1.1', severidad: 'alta', estado: 'pendiente' })]);
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
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: { h3: { criterio: 'SC9.9.9' } } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { cierre: { fecha: '31/12/2026' } }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { otro: 1 }),
      pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', {}),
    ]);
    for (const r of malos) expect(r.statusCode).toBe(400);
    const muchos = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`m${i}`, { hallazgo: 'x' }]));
    expect((await pedir('PATCH', `/api/accesibilidad/${id}`, 'editor', { hallazgos: muchos })).statusCode).toBe(400);
    expect((await pedir('PATCH', '/api/accesibilidad/no-existe', 'editor', { cierre: { cargo: 'x' } })).statusCode).toBe(404);
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
