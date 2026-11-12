import { crearSesion } from '../src/auth';
import { CLAVE, Entorno, conBase, ingresar, prepararEntorno } from './ayudas';

conBase('autenticación y usuarios (MySQL)', () => {
  let e: Entorno;
  beforeAll(async () => (e = await prepararEntorno()));
  afterAll(() => e?.cerrar());

  const pedir = (method: string, url: string, cookie?: string, payload?: unknown) =>
    e.app.inject({ method: method as any, url, payload: payload as any, headers: cookie ? { cookie } : {} });

  it('rechaza credenciales incorrectas sin revelar si el usuario existe', async () => {
    const a = await pedir('POST', '/api/auth/ingresar', undefined, { usuario: 'admin', clave: 'mala-clave-123' });
    const b = await pedir('POST', '/api/auth/ingresar', undefined, { usuario: 'no-existe', clave: 'mala-clave-123' });
    expect(a.statusCode).toBe(401);
    expect(b.statusCode).toBe(401);
    expect(a.json()).toEqual(b.json());
  });

  it('la cookie de sesión es httpOnly y SameSite=Strict, y no expone el hash', async () => {
    const r = await pedir('POST', '/api/auth/ingresar', undefined, { usuario: 'ADMIN', clave: CLAVE });
    expect(r.statusCode).toBe(200);
    const c = r.cookies.find((x) => x.name === 'ita_sesion')!;
    expect(c.httpOnly).toBe(true);
    expect(c.sameSite).toBe('Strict');
    expect(r.body).not.toContain('clave_hash');
    expect(r.json()).toMatchObject({ usuario: 'admin', rol: 'admin' });
  });

  it('sin sesión, la API responde 401', async () => {
    expect((await pedir('GET', '/api/registros')).statusCode).toBe(401);
    expect((await pedir('GET', '/api/auth/yo', 'ita_sesion=inventada')).statusCode).toBe(401);
  });

  it('bloquea peticiones de otro origen (CSRF)', async () => {
    const r = await e.app.inject({
      method: 'POST',
      url: '/api/registros',
      headers: { cookie: e.cookies.editor, origin: 'https://sitio-malicioso.example' },
      payload: { nombre: 'X', tipo: 'procuraduria', vigencia: 2026 },
    });
    expect(r.statusCode).toBe(403);
  });

  it('cerrar sesión invalida la cookie en el servidor', async () => {
    const cookie = await ingresar(e.app, 'lector');
    expect((await pedir('GET', '/api/auth/yo', cookie)).statusCode).toBe(200);
    const fuera = await pedir('POST', '/api/auth/salir', cookie);
    // La renovación de la cookie al entrar a la ruta no debe impedir que se borre.
    expect(fuera.cookies.filter((x) => x.name === 'ita_sesion').map((x) => x.value)).toEqual(['']);
    expect((await pedir('GET', '/api/auth/yo', cookie)).statusCode).toBe(401);
  });

  it('cada petición renueva la cookie e informa la duración', async () => {
    const r = await pedir('GET', '/api/auth/yo', e.cookies.lector);
    const c = r.cookies.find((x) => x.name === 'ita_sesion')!;
    expect(`ita_sesion=${c.value}`).toBe(e.cookies.lector);
    expect(c.maxAge).toBe(480 * 60);
    expect(c.httpOnly).toBe(true);
    expect(r.headers['x-sesion-minutos']).toBe('480');
    expect((await pedir('GET', '/api/auth/yo', 'ita_sesion=inventada')).headers['x-sesion-minutos']).toBeUndefined();
  });

  it('solo el administrador gestiona usuarios', async () => {
    expect((await pedir('GET', '/api/usuarios', e.cookies.editor)).statusCode).toBe(403);
    expect((await pedir('GET', '/api/usuarios', e.cookies.lector)).statusCode).toBe(403);
    const r = await pedir('GET', '/api/usuarios', e.cookies.admin);
    expect(r.statusCode).toBe(200);
    expect(r.json()).toHaveLength(3);
    expect(r.json().find((u: any) => u.usuario === 'lector').formatos).toEqual({ ita: 'ver' });
  });

  describe('ciclo de vida de un usuario nuevo', () => {
    it('se crea con cambio de clave obligatorio y no puede usar la API hasta cambiarla', async () => {
      const r = await pedir('POST', '/api/usuarios', e.cookies.admin, {
        usuario: 'Nuevo.Usuario', nombre: 'Nuevo', rol: 'editor', clave: 'temporal-2026', formatos: { ita: 'editar' },
      });
      expect(r.statusCode).toBe(201);
      expect(r.json()).toMatchObject({ usuario: 'nuevo.usuario', debeCambiarClave: true, formatos: { ita: 'editar' } });

      const cookie = await ingresar(e.app, 'nuevo.usuario', 'temporal-2026');
      const bloqueado = await pedir('GET', '/api/registros', cookie);
      expect(bloqueado.statusCode).toBe(403);
      expect(bloqueado.json().codigo).toBe('cambiar-clave');

      expect((await pedir('POST', '/api/auth/clave', cookie, { actual: 'otra', nueva: 'definitiva-2026' })).statusCode).toBe(400);
      expect((await pedir('POST', '/api/auth/clave', cookie, { actual: 'temporal-2026', nueva: 'corta' })).statusCode).toBe(400);
      const ok = await pedir('POST', '/api/auth/clave', cookie, { actual: 'temporal-2026', nueva: 'definitiva-2026' });
      expect(ok.statusCode).toBe(200);
      expect((await pedir('GET', '/api/registros', cookie)).statusCode).toBe(200);
    });

    it('rechaza usuarios duplicados', async () => {
      const r = await pedir('POST', '/api/usuarios', e.cookies.admin, {
        usuario: 'nuevo.usuario', nombre: 'Otro', rol: 'lector', clave: 'temporal-2026',
      });
      expect(r.statusCode).toBe(409);
    });

    it('desactivar a un usuario cierra sus sesiones', async () => {
      const cookie = await ingresar(e.app, 'nuevo.usuario', 'definitiva-2026');
      const [[u]] = await e.db.query<any[]>("SELECT id FROM usuarios WHERE usuario = 'nuevo.usuario'");
      expect((await pedir('PATCH', `/api/usuarios/${u.id}`, e.cookies.admin, { activo: false })).statusCode).toBe(200);
      expect((await pedir('GET', '/api/auth/yo', cookie)).statusCode).toBe(401);
      expect((await pedir('POST', '/api/auth/ingresar', undefined, { usuario: 'nuevo.usuario', clave: 'definitiva-2026' })).statusCode).toBe(401);
    });
  });

  it('permisos por formato: sin acceso, consulta, edición y el lector nunca edita', async () => {
    const yo = async (c: string) => (await pedir('GET', '/api/auth/yo', c)).json().formatos;
    expect(await yo(e.cookies.admin)).toEqual({ ita: 'editar' });
    expect(await yo(e.cookies.editor)).toEqual({ ita: 'editar' });
    expect(await yo(e.cookies.lector)).toEqual({ ita: 'ver' });

    const [r] = await e.db.query<any>(
      'INSERT INTO usuarios (usuario, nombre, rol, clave_hash, debe_cambiar_clave) SELECT ?, ?, ?, clave_hash, 0 FROM usuarios WHERE usuario = ?',
      ['sin.formatos', 'Sin formatos', 'editor', 'admin'],
    );
    // Sin pasar por /ingresar, que tiene límite de intentos.
    const cookie = `ita_sesion=${await crearSesion(e.db, r.insertId, 30)}`;
    const nuevo = { nombre: 'X', tipo: 'procuraduria', vigencia: 2026 };
    expect(await yo(cookie)).toEqual({});
    expect((await pedir('GET', '/api/registros', cookie)).statusCode).toBe(403);
    expect((await pedir('GET', '/api/respaldo', cookie)).statusCode).toBe(403);

    // El cambio aplica en la siguiente petición, sin volver a ingresar.
    expect((await pedir('PATCH', `/api/usuarios/${r.insertId}`, e.cookies.admin, { formatos: { ita: 'ver' } })).statusCode).toBe(200);
    expect((await pedir('GET', '/api/registros', cookie)).statusCode).toBe(200);
    expect((await pedir('POST', '/api/registros', cookie, nuevo)).statusCode).toBe(403);

    const lector = await pedir('PATCH', `/api/usuarios/${r.insertId}`, e.cookies.admin, { rol: 'lector', formatos: { ita: 'editar' } });
    expect(lector.json().formatos).toEqual({ ita: 'ver' });
    expect((await pedir('POST', '/api/usuarios', e.cookies.admin, { usuario: 'x.y', nombre: 'X', rol: 'editor', clave: 'temporal-2026', formatos: { otro: 'ver' } })).statusCode).toBe(400);
  });

  it('no permite quedarse sin administradores activos', async () => {
    const [[a]] = await e.db.query<any[]>("SELECT id FROM usuarios WHERE usuario = 'admin'");
    const r = await pedir('PATCH', `/api/usuarios/${a.id}`, e.cookies.admin, { rol: 'editor' });
    expect(r.statusCode).toBe(409);
    expect((await pedir('PATCH', `/api/usuarios/${a.id}`, e.cookies.admin, { activo: false })).statusCode).toBe(409);
  });

  it('registra ingresos en la auditoría', async () => {
    const [filas] = await e.db.query<any[]>("SELECT accion FROM auditoria WHERE accion IN ('ingreso', 'ingreso-fallido')");
    expect(filas.some((f) => f.accion === 'ingreso')).toBe(true);
    expect(filas.some((f) => f.accion === 'ingreso-fallido')).toBe(true);
  });
});
