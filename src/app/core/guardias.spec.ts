import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, mensajeError } from './auth.service';
import { conFormato, conSesion, interceptorSesion, soloAdmin } from './guardias';
import { Usuario } from './modelos';
import { problemaClave } from '../paginas/ingresar';

const usuario = (d: Partial<Usuario> = {}): Usuario => ({
  id: 1, usuario: 'ana', nombre: 'Ana', rol: 'editor', activo: true, debeCambiarClave: false, formatos: { ita: 'editar' }, ...d,
});

describe('guardias y sesión', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(withInterceptors([interceptorSesion])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });
  afterEach(() => http.verify());

  const correr = (guard: typeof conSesion, url = '/r/x') =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot)) as Promise<boolean | UrlTree>;

  async function conRespuesta<T>(p: Promise<T>, cuerpo: object, status = 200): Promise<T> {
    await Promise.resolve();
    http.expectOne('/api/auth/yo').flush(cuerpo, { status, statusText: String(status) });
    return p;
  }

  it('sin sesión lleva a ingresar recordando a dónde iba', async () => {
    const r = await conRespuesta(correr(conSesion), { error: 'x' }, 401);
    expect(router.serializeUrl(r as UrlTree)).toBe('/ingresar?volver=%2Fr%2Fx');
    expect(auth.usuario()).toBeNull();
  });

  it('con sesión deja pasar y solo consulta al servidor una vez', async () => {
    expect(await conRespuesta(correr(conSesion), usuario())).toBe(true);
    expect(await correr(conSesion)).toBe(true);
  });

  it('si debe cambiar la contraseña lo lleva a hacerlo', async () => {
    const r = await conRespuesta(correr(conSesion), usuario({ debeCambiarClave: true }));
    expect(router.serializeUrl(r as UrlTree)).toBe('/ingresar?cambiar=1');
  });

  it('soloAdmin bloquea a editores y deja pasar a administradores', async () => {
    const r = await conRespuesta(correr(soloAdmin), usuario());
    expect(router.serializeUrl(r as UrlTree)).toBe('/');
    auth.usuario.set(usuario({ rol: 'admin' }));
    expect(await correr(soloAdmin)).toBe(true);
  });

  it('conFormato deja pasar con permiso de consulta y sin acceso vuelve al panel', async () => {
    const r = await conRespuesta(correr(conFormato('ita')), usuario({ formatos: {} }));
    expect(router.serializeUrl(r as UrlTree)).toBe('/');
    auth.usuario.set(usuario({ formatos: { ita: 'ver' } }));
    expect(await correr(conFormato('ita'))).toBe(true);
    expect(auth.puede('ita', 'editar')).toBe(false);
  });

  it('el interceptor cierra la sesión local cuando el servidor responde 401', async () => {
    auth.usuario.set(usuario());
    const nav = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const p = firstValueFrom(TestBed.inject(HttpClient).get('/api/registros'));
    http.expectOne('/api/registros').flush({ error: 'Debes iniciar sesión.' }, { status: 401, statusText: 'Unauthorized' });
    await expect(p).rejects.toBeTruthy();
    expect(auth.usuario()).toBeNull();
    expect(nav).toHaveBeenCalledWith(['/ingresar'], { queryParams: { vencida: 1 } });
  });

  it('mensajeError usa el mensaje de la API', async () => {
    const p = firstValueFrom(TestBed.inject(HttpClient).get('/api/x'));
    http.expectOne('/api/x').flush({ error: 'Usuario o contraseña incorrectos.' }, { status: 400, statusText: 'Bad' });
    const e = await p.catch((x) => x);
    expect(mensajeError(e)).toBe('Usuario o contraseña incorrectos.');
  });
});

describe('problemaClave', () => {
  it.each([
    ['corta1', 'clave.corta'],
    ['solo-letras-largas', 'clave.letrasNumeros'],
    ['clave-segura-2026', null],
  ])('%s', (c, esperado) => expect(problemaClave(c)).toBe(esperado));
});
