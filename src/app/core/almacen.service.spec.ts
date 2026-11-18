import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AlmacenService, ESPERA_TEXTO_MS } from './almacen.service';
import { AuthService } from './auth.service';
import { Registro, Rol } from './modelos';
import { registroDePrueba } from '../../testing/fabricas';

/** Deja correr las promesas pendientes (la cola de escrituras es asíncrona). */
const tick = async (n = 5) => {
  for (let i = 0; i < n; i++) await Promise.resolve();
};

describe('AlmacenService', () => {
  let almacen: AlmacenService;
  let http: HttpTestingController;
  let reg: Registro;

  function preparar(rol: Rol = 'editor') {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.inject(AuthService).usuario.set({
      id: 1, usuario: 'u', nombre: 'U', rol, activo: true, debeCambiarClave: false, formatos: { ita: rol === 'lector' ? 'ver' : 'editar' },
    });
    almacen = TestBed.inject(AlmacenService);
    http = TestBed.inject(HttpTestingController);
    reg = registroDePrueba({ evidencias: [{ id: 'e1', titulo: 'Acta', url: 'https://pb.edu.co/acta' }] });
    almacen.registros.set([reg]);
    almacen.activoId.set(reg.id);
  }

  afterEach(() => {
    vi.useRealTimers();
    try {
      http.verify();
    } finally {
      TestBed.resetTestingModule();
    }
  });

  it('soloLectura depende del rol', () => {
    preparar('lector');
    expect(almacen.soloLectura()).toBe(true);
    TestBed.inject(AuthService).usuario.update((u) => ({ ...u!, formatos: { ita: 'editar' } }));
    expect(almacen.soloLectura()).toBe(false);
  });

  it('cargar trae los registros del servidor', async () => {
    preparar();
    const p = almacen.cargar();
    await tick();
    http.expectOne({ method: 'GET', url: '/api/registros' }).flush([reg, registroDePrueba({ id: 'reg-2' })]);
    await p;
    expect(almacen.registros().map((r) => r.id)).toEqual(['reg-1', 'reg-2']);
    expect(almacen.cargado()).toBe(true);
  });

  it('cambiar el estado se ve al instante y se envía al servidor', async () => {
    preparar();
    almacen.actualizarRespuesta(6, { estado: 'SI' });
    expect(almacen.respuesta(6).estado).toBe('SI');
    expect(almacen.estadoSync()).toBe('guardando');
    await tick();
    const req = http.expectOne({ method: 'PATCH', url: '/api/registros/reg-1/respuestas' });
    expect(req.request.body).toEqual({ filas: [6], cambios: { estado: 'SI' } });
    req.flush({ ok: true });
    await tick();
    expect(almacen.estadoSync()).toBe('guardado');
  });

  it('agrupa lo que se escribe y solo envía el último texto', async () => {
    vi.useFakeTimers();
    preparar();
    for (const t of ['N', 'No', 'No aplica']) almacen.actualizarRespuesta(6, { observacion: t });
    expect(almacen.respuesta(6).observacion).toBe('No aplica');
    expect(almacen.estadoSync()).toBe('pendiente');
    http.expectNone('/api/registros/reg-1/respuestas');

    await vi.advanceTimersByTimeAsync(ESPERA_TEXTO_MS);
    const req = http.expectOne('/api/registros/reg-1/respuestas');
    expect(req.request.body).toEqual({ filas: [6], cambios: { observacion: 'No aplica' } });
    req.flush({ ok: true });
  });

  it('un cambio masivo reemplaza el texto que estaba en espera', async () => {
    vi.useFakeTimers();
    preparar();
    almacen.actualizarRespuesta(6, { observacion: 'borrador' });
    almacen.actualizarVarias([6, 7], { observacion: 'Texto común' });
    await vi.advanceTimersByTimeAsync(ESPERA_TEXTO_MS * 2);
    const reqs = http.match('/api/registros/reg-1/respuestas');
    expect(reqs.map((r) => r.request.body)).toEqual([{ filas: [6, 7], cambios: { observacion: 'Texto común' } }]);
    reqs.forEach((r) => r.flush({ ok: true }));
  });

  it('las escrituras se envían en orden: la evidencia existe antes de asignarla', async () => {
    preparar();
    const ev = almacen.agregarEvidencia({ titulo: 'Nueva', url: 'https://pb.edu.co/nueva ' });
    expect(ev.url).toBe('https://pb.edu.co/nueva');
    almacen.asignarEvidencia(ev.id, [6]);
    expect(almacen.respuesta(6).evidencias).toEqual([ev.id]);
    await tick();

    const crear = http.expectOne({ method: 'POST', url: '/api/registros/reg-1/evidencias' });
    http.expectNone(`/api/registros/reg-1/evidencias/${ev.id}/asignar`);
    crear.flush(ev);
    await tick();
    http.expectOne(`/api/registros/reg-1/evidencias/${ev.id}/asignar`).flush({ ok: true });
  });

  it('no duplica una URL que ya está en la biblioteca', () => {
    preparar();
    const ev = almacen.agregarEvidencia({ titulo: 'Otra', url: 'https://pb.edu.co/acta.' });
    expect(ev.id).toBe('e1');
    expect(almacen.activo()!.evidencias).toHaveLength(1);
    http.expectNone('/api/registros/reg-1/evidencias');
  });

  it('si el servidor rechaza un cambio, avisa y recarga la versión del servidor', async () => {
    preparar();
    almacen.actualizarRespuesta(6, { estado: 'NO' });
    await tick();
    http
      .expectOne('/api/registros/reg-1/respuestas')
      .flush({ error: 'No tienes permiso para esta acción.' }, { status: 403, statusText: 'Forbidden' });
    await tick();
    http.expectOne({ method: 'GET', url: '/api/registros/reg-1' }).flush(reg);
    await tick();
    expect(almacen.estadoSync()).toBe('error');
    expect(almacen.errorSync()).toBe('No tienes permiso para esta acción.');
    expect(almacen.respuesta(6).estado).toBeNull();
  });

  it('eliminar una evidencia la quita de los ítems', async () => {
    preparar();
    almacen.registros.set([{ ...reg, respuestas: { 6: { estado: 'SI', observacion: '', evidencias: ['e1'] } } }]);
    almacen.eliminarEvidencia('e1');
    expect(almacen.activo()!.evidencias).toEqual([]);
    expect(almacen.respuesta(6).evidencias).toEqual([]);
    await tick();
    http.expectOne({ method: 'DELETE', url: '/api/registros/reg-1/evidencias/e1' }).flush(null);
  });

  it('refrescar espera los textos pendientes antes de pedir el registro', async () => {
    vi.useFakeTimers();
    preparar();
    almacen.actualizarRespuesta(6, { observacion: 'sin enviar' });
    const p = almacen.refrescar('reg-1');
    await tick();
    http.expectOne('/api/registros/reg-1/respuestas').flush({ ok: true });
    await tick(20);
    const actualizado = { ...reg, nombre: 'Cambiado por otra persona' };
    http.expectOne({ method: 'GET', url: '/api/registros/reg-1' }).flush(actualizado);
    expect((await p)!.nombre).toBe('Cambiado por otra persona');
    expect(almacen.activo()!.nombre).toBe('Cambiado por otra persona');
  });

  it('refrescar un registro eliminado lo quita de la lista', async () => {
    preparar();
    const p = almacen.refrescar('reg-1');
    await tick();
    http.expectOne('/api/registros/reg-1').flush({ error: 'x' }, { status: 404, statusText: 'Not Found' });
    expect(await p).toBeNull();
    expect(almacen.registros()).toEqual([]);
  });

  it('crear envía la base o el contenido y agrega el registro', async () => {
    preparar();
    const p = almacen.crear({ nombre: 'Copia', tipo: 'seguimiento', vigencia: 2026, periodo: '' }, { baseId: 'reg-1' });
    await tick();
    const req = http.expectOne({ method: 'POST', url: '/api/registros' });
    expect(req.request.body).toEqual({ nombre: 'Copia', tipo: 'seguimiento', vigencia: 2026, periodo: null, baseId: 'reg-1' });
    req.flush(registroDePrueba({ id: 'reg-2', nombre: 'Copia' }));
    expect((await p).id).toBe('reg-2');
    expect(almacen.registros().map((r) => r.id)).toEqual(['reg-2', 'reg-1']);
  });

  it('restaurar rechaza archivos que no son JSON sin llamar al servidor', async () => {
    preparar();
    await expect(almacen.restaurar('no es json')).rejects.toThrow(/JSON válido/);
  });

  it('limpiar borra los datos en memoria (al cerrar sesión)', () => {
    preparar();
    almacen.ultimoGuardado.set('2026-01-01T00:00:00.000Z');
    almacen.errorSync.set('fallo anterior');
    almacen.estadoSync.set('error');
    almacen.limpiar();
    expect(almacen.registros()).toEqual([]);
    expect(almacen.activo()).toBeNull();
    // El siguiente usuario no debe ver el estado de guardado de la sesión anterior.
    expect([almacen.estadoSync(), almacen.errorSync(), almacen.ultimoGuardado()]).toEqual(['guardado', null, null]);
  });
});
