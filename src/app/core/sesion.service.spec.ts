import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Router, provideRouter } from '@angular/router';
import { Subject } from 'rxjs';
import { AuthService } from './auth.service';
import { Usuario } from './modelos';
import { SesionService } from './sesion.service';

const MIN = 60_000;
const CLAVE = 'matriz-ita.sesion-vence';

describe('SesionService', () => {
  let sesion: SesionService;
  let auth: AuthService;
  let cierre: Subject<string | undefined>;
  let abrir: ReturnType<typeof vi.fn>;
  let cerrarDialogo: ReturnType<typeof vi.fn>;
  let navegar: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    cierre = new Subject();
    cerrarDialogo = vi.fn(() => cierre.next(undefined));
    abrir = vi.fn(() => ({ afterClosed: () => cierre.asObservable(), close: cerrarDialogo }));
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting(), { provide: MatDialog, useValue: { open: abrir } }],
    });
    auth = TestBed.inject(AuthService);
    auth.usuario.set({ id: 1 } as Usuario);
    auth.verificado.set(true);
    navegar = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    sesion = TestBed.inject(SesionService);
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('avisa 5 minutos antes de vencer, no antes', () => {
    sesion.actividad(30);
    vi.advanceTimersByTime(25 * MIN - 1000);
    expect(abrir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('en una sesión corta avisa a la mitad, para no avisar de inmediato', () => {
    sesion.actividad(4);
    expect(abrir).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2 * MIN);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('la actividad aplaza el aviso y cierra el que estuviera abierto', () => {
    sesion.actividad(30);
    vi.advanceTimersByTime(25 * MIN);
    expect(abrir).toHaveBeenCalledTimes(1);
    sesion.actividad(30);
    expect(cerrarDialogo).toHaveBeenCalled();
    vi.advanceTimersByTime(24 * MIN);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('no avisa si otra pestaña extendió la sesión', () => {
    sesion.actividad(30);
    vi.advanceTimersByTime(20 * MIN);
    localStorage.setItem(CLAVE, String(Date.now() + 30 * MIN));
    vi.advanceTimersByTime(5 * MIN);
    expect(abrir).not.toHaveBeenCalled();
  });

  it('"Seguir conectado" pide la sesión al servidor', () => {
    sesion.actividad(30);
    vi.advanceTimersByTime(25 * MIN);
    cierre.next('seguir');
    TestBed.inject(HttpTestingController).expectOne('/api/auth/yo');
  });

  it('al vencer termina la sesión local y lleva a ingresar', () => {
    sesion.actividad(30);
    vi.advanceTimersByTime(30 * MIN);
    expect(auth.usuario()).toBeNull();
    expect(cerrarDialogo).toHaveBeenCalled();
    expect(navegar).toHaveBeenCalledWith(['/ingresar'], { queryParams: { vencida: 1 } });
    expect(localStorage.getItem(CLAVE)).toBeNull();
  });

  it('si otra pestaña cerró la sesión, esta también termina', () => {
    sesion.actividad(30);
    dispatchEvent(new StorageEvent('storage', { key: CLAVE, newValue: null }));
    expect(auth.usuario()).toBeNull();
    expect(navegar).toHaveBeenCalled();
  });

  it('tras cerrar sesión ya no avisa ni redirige', () => {
    sesion.actividad(30);
    auth.sesionTerminada();
    vi.advanceTimersByTime(30 * MIN);
    expect(abrir).not.toHaveBeenCalled();
    expect(navegar).not.toHaveBeenCalled();
  });
});
