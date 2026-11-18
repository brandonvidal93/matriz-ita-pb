import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ESPERA_TEXTO_MS, EstadoSync, ResultadoRestauracion } from '../../core/almacen.service';
import { AuthService, mensajeError } from '../../core/auth.service';
import { Evidencia, normalizarUrl, nuevoId } from '../../core/modelos';
import { CambioEvaluacion, Destinos, Evaluacion, aplicarCambio } from './modelo';

const API = '/api/accesibilidad';

/**
 * Estado de las evaluaciones de accesibilidad, con el mismo esquema de AlmacenService:
 * el cambio se ve primero en pantalla y se envía por una cola en serie; los textos
 * esperan ESPERA_TEXTO_MS tras la última tecla. Si un envío falla, se recarga del servidor.
 */
@Injectable({ providedIn: 'root' })
export class EvaluacionesService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly lista = signal<Evaluacion[]>([]);
  readonly cargado = signal(false);
  readonly activaId = signal<string | null>(null);
  readonly activa = computed(() => this.lista().find((e) => e.id === this.activaId()) ?? null);
  readonly soloLectura = computed(() => !this.auth.puede('accesibilidad', 'editar'));

  readonly estadoSync = signal<EstadoSync>('guardado');
  readonly errorSync = signal<string | null>(null);
  readonly ultimoGuardado = signal<string | null>(null);

  private cola: Promise<unknown> = Promise.resolve();
  private enCurso = 0;
  private textos = new Map<string, { timer: ReturnType<typeof setTimeout>; enviar: () => void }>();

  constructor() {
    addEventListener('beforeunload', (ev) => {
      if (this.hayPendientes()) {
        this.vaciarTextos();
        ev.preventDefault();
      }
    });
  }

  hayPendientes(): boolean {
    return this.enCurso > 0 || this.textos.size > 0;
  }

  async cargar(): Promise<void> {
    await this.vaciar();
    this.lista.set(await firstValueFrom(this.http.get<Evaluacion[]>(API)));
    this.cargado.set(true);
  }

  /** Trae la versión más reciente (con los cambios de otras personas); null si ya no existe. */
  async refrescar(id: string): Promise<Evaluacion | null> {
    await this.vaciar();
    try {
      const e = await firstValueFrom(this.http.get<Evaluacion>(`${API}/${encodeURIComponent(id)}`));
      this.lista.update((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? e : x)) : [e, ...l]));
      return e;
    } catch (err: any) {
      if (err?.status !== 404) throw err;
      this.lista.update((l) => l.filter((x) => x.id !== id));
      return null;
    }
  }

  limpiar(): void {
    this.lista.set([]);
    this.cargado.set(false);
    this.activaId.set(null);
    this.estadoSync.set('guardado');
    this.errorSync.set(null);
    this.ultimoGuardado.set(null);
  }

  async crear(): Promise<Evaluacion> {
    await this.vaciar();
    const e = await firstValueFrom(this.http.post<Evaluacion>(API, {}));
    this.lista.update((l) => [e, ...l]);
    return e;
  }

  async eliminar(id: string): Promise<void> {
    await this.vaciar();
    await firstValueFrom(this.http.delete(`${API}/${encodeURIComponent(id)}`));
    this.lista.update((l) => l.filter((e) => e.id !== id));
  }

  /**
   * Aplica un cambio a la evaluación activa. Con `texto` (una clave por campo) se
   * agrupan las pulsaciones y solo se envía el último valor.
   */
  cambiar(cambio: CambioEvaluacion, texto?: string): void {
    const id = this.activaId();
    if (!id) throw new Error('No hay evaluación activa');
    this.lista.update((l) => l.map((e) => (e.id === id ? { ...aplicarCambio(e, cambio), actualizado: new Date().toISOString() } : e)));
    const enviar = () => this.enviar(id, cambio);
    if (!texto) return void enviar();
    const clave = `${id}|${texto}`;
    const previo = this.textos.get(clave);
    if (previo) clearTimeout(previo.timer);
    const ejecutar = () => {
      this.textos.delete(clave);
      enviar();
    };
    this.textos.set(clave, { timer: setTimeout(ejecutar, ESPERA_TEXTO_MS), enviar: ejecutar });
    if (!this.enCurso) this.estadoSync.set('pendiente');
  }

  // ---------- evidencias (mismo comportamiento que AlmacenService) ----------
  /** Agrega una evidencia a la biblioteca; si la URL ya existe, devuelve la existente. */
  agregarEvidencia(datos: Omit<Evidencia, 'id'>): Evidencia {
    const url = normalizarUrl(datos.url);
    const existente = this.activa()?.evidencias.find((e) => normalizarUrl(e.url) === url);
    if (existente) return existente;
    const ev: Evidencia = { ...datos, url, id: nuevoId() };
    const { id, ...resto } = ev;
    this.cambiar({ evidencias: { [id]: resto } });
    return ev;
  }

  editarEvidencia(evId: string, cambios: Partial<Evidencia>): void {
    const c: Record<string, unknown> = {};
    if (cambios.titulo !== undefined) c['titulo'] = cambios.titulo;
    if (cambios.url !== undefined) c['url'] = normalizarUrl(cambios.url);
    if ('descripcion' in cambios) c['descripcion'] = cambios.descripcion ?? null;
    if ('verificacion' in cambios) c['verificacion'] = cambios.verificacion ?? null;
    this.cambiar({ evidencias: { [evId]: c } });
  }

  eliminarEvidencia(evId: string): void {
    this.cambiar({ evidencias: { [evId]: null } });
  }

  asignarEvidencia(d: Destinos): void {
    if (d.criterios?.length || d.hallazgos?.length) this.cambiar({ asignar: d });
  }

  quitarEvidencia(d: Destinos): void {
    if (d.criterios?.length || d.hallazgos?.length) this.cambiar({ quitar: d });
  }

  // ---------- respaldos (mismo comportamiento que AlmacenService) ----------
  async respaldoCompleto(): Promise<Blob> {
    await this.vaciar();
    const datos = await firstValueFrom(this.http.get(`${API}/respaldo`));
    return new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
  }

  /** Restaura un respaldo (solo administradores). */
  async restaurar(texto: string): Promise<ResultadoRestauracion> {
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error('El archivo no es un JSON válido.');
    }
    const r = await firstValueFrom(this.http.post<ResultadoRestauracion>(`${API}/respaldo`, datos));
    await this.cargar();
    return r;
  }

  /** Envía los textos en espera y aguarda a que la cola termine. */
  async vaciar(): Promise<void> {
    this.vaciarTextos();
    await this.cola;
  }

  private vaciarTextos(): void {
    for (const t of [...this.textos.values()]) {
      clearTimeout(t.timer);
      t.enviar();
    }
  }

  private enviar(id: string, cambio: CambioEvaluacion): Promise<unknown> {
    this.enCurso++;
    this.estadoSync.set('guardando');
    const p = this.cola
      .then(() => firstValueFrom(this.http.patch(`${API}/${encodeURIComponent(id)}`, cambio)))
      .then(
        () => {
          this.ultimoGuardado.set(new Date().toISOString());
          if (this.estadoSync() !== 'error') this.errorSync.set(null);
        },
        async (e) => {
          this.errorSync.set(mensajeError(e));
          this.estadoSync.set('error');
          // Se descarta el cambio local y se vuelve a lo que tiene el servidor.
          try {
            const r = await firstValueFrom(this.http.get<Evaluacion>(`${API}/${encodeURIComponent(id)}`));
            this.lista.update((l) => l.map((x) => (x.id === id ? r : x)));
          } catch {}
        },
      )
      .finally(() => {
        this.enCurso--;
        if (!this.enCurso && this.estadoSync() === 'guardando') this.estadoSync.set(this.textos.size ? 'pendiente' : 'guardado');
      });
    this.cola = p;
    return p;
  }
}
