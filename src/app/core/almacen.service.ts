import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService, mensajeError } from './auth.service';
import { Evidencia, Registro, Respuesta, TipoCorte, normalizarUrl, nuevoId, respuestaVacia } from './modelos';

export type EstadoSync = 'guardado' | 'pendiente' | 'guardando' | 'error';

export interface DatosRegistro {
  nombre: string;
  tipo: TipoCorte;
  vigencia: number;
  periodo?: string;
}

/** Contenido inicial de un registro nuevo (p. ej. importado de un .xlsx). */
export type ContenidoRegistro = Pick<Registro, 'respuestas' | 'evidencias'> & Partial<Pick<Registro, 'formatoEvidencias'>>;

export interface ResultadoRestauracion {
  creados: { id: string; nombre: string }[];
  omitidos: { id: string; nombre: string; motivo: string }[];
}

type CampoTexto = 'observacion' | 'notaInterna';

/** Espera tras la última tecla antes de enviar un texto al servidor. */
export const ESPERA_TEXTO_MS = 600;

/**
 * Estado central de la aplicación. La fuente de verdad es la API (MySQL).
 * Los cambios se aplican primero en pantalla (actualización optimista) y se
 * envían al servidor en orden; si alguno falla, se recarga el registro.
 */
@Injectable({ providedIn: 'root' })
export class AlmacenService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);

  readonly registros = signal<Registro[]>([]);
  readonly cargado = signal(false);
  readonly activoId = signal<string | null>(null);
  readonly activo = computed(() => this.registros().find((r) => r.id === this.activoId()) ?? null);
  readonly soloLectura = computed(() => !this.auth.puedeEditar());

  readonly estadoSync = signal<EstadoSync>('guardado');
  readonly errorSync = signal<string | null>(null);
  readonly ultimoGuardado = signal<string | null>(null);

  /** Cola de escrituras: se envían una tras otra para respetar el orden. */
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

  // ---------- lectura ----------
  async cargar(): Promise<void> {
    await this.vaciar();
    const lista = await firstValueFrom(this.http.get<Registro[]>('/api/registros'));
    this.registros.set(lista);
    this.cargado.set(true);
  }

  async asegurarCargado(): Promise<void> {
    if (!this.cargado()) await this.cargar();
  }

  /** Trae la versión más reciente de un registro (con los cambios de otras personas). */
  async refrescar(id: string): Promise<Registro | null> {
    await this.vaciar();
    try {
      const r = await firstValueFrom(this.http.get<Registro>(`/api/registros/${id}`));
      this.registros.update((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? r : x)) : [r, ...l]));
      return r;
    } catch (e: any) {
      if (e?.status === 404) {
        this.registros.update((l) => l.filter((x) => x.id !== id));
        return null;
      }
      throw e;
    }
  }

  /** Al cerrar sesión no deben quedar datos en memoria. */
  limpiar(): void {
    this.registros.set([]);
    this.cargado.set(false);
    this.activoId.set(null);
    this.estadoSync.set('guardado');
    this.errorSync.set(null);
    this.ultimoGuardado.set(null);
  }

  // ---------- escritura ----------
  /** Envía todos los textos en espera y aguarda a que la cola termine. */
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

  private enviar<T>(registroId: string, peticion: () => Observable<T>): Promise<T | undefined> {
    this.enCurso++;
    this.estadoSync.set('guardando');
    const p = this.cola
      .then(() => firstValueFrom(peticion()))
      .then(
        (r) => {
          this.ultimoGuardado.set(new Date().toISOString());
          if (this.estadoSync() !== 'error') this.errorSync.set(null);
          return r;
        },
        async (e) => {
          this.errorSync.set(mensajeError(e));
          this.estadoSync.set('error');
          // Se descarta el cambio local y se vuelve a lo que tiene el servidor.
          try {
            const r = await firstValueFrom(this.http.get<Registro>(`/api/registros/${registroId}`));
            this.registros.update((l) => l.map((x) => (x.id === registroId ? r : x)));
          } catch {}
          return undefined;
        },
      )
      .finally(() => {
        this.enCurso--;
        if (!this.enCurso && this.estadoSync() === 'guardando') this.estadoSync.set(this.textos.size ? 'pendiente' : 'guardado');
      });
    this.cola = p;
    return p;
  }

  private url(id: string, resto = ''): string {
    return `/api/registros/${encodeURIComponent(id)}${resto}`;
  }

  private mutarLocal(id: string, fn: (r: Registro) => Registro): void {
    this.registros.update((lista) =>
      lista.map((r) => (r.id === id ? { ...fn(r), actualizado: new Date().toISOString() } : r)),
    );
  }

  private idActivo(): string {
    const id = this.activoId();
    if (!id) throw new Error('No hay registro activo');
    return id;
  }

  // ---------- registros ----------
  /** Crea un registro vacío, como copia de otro (`baseId`) o con un contenido importado. */
  async crear(datos: DatosRegistro, origen: { baseId?: string; contenido?: ContenidoRegistro } = {}): Promise<Registro> {
    await this.vaciar();
    const reg = await firstValueFrom(
      this.http.post<Registro>('/api/registros', { ...datos, periodo: datos.periodo || null, ...origen }),
    );
    this.registros.update((l) => [reg, ...l]);
    return reg;
  }

  renombrar(id: string, datos: Partial<Pick<Registro, 'nombre' | 'tipo' | 'vigencia' | 'periodo' | 'formatoEvidencias'>>): void {
    this.mutarLocal(id, (r) => ({ ...r, ...datos }));
    this.enviar(id, () => this.http.patch(this.url(id), datos));
  }

  async eliminar(id: string): Promise<void> {
    await this.vaciar();
    await firstValueFrom(this.http.delete(this.url(id)));
    this.registros.update((l) => l.filter((r) => r.id !== id));
  }

  // ---------- respuestas ----------
  respuesta(fila: number): Respuesta {
    return this.activo()?.respuestas[fila] ?? respuestaVacia();
  }

  actualizarRespuesta(fila: number, cambios: Partial<Respuesta>): void {
    this.actualizarVarias([fila], cambios);
  }

  actualizarVarias(filas: number[], cambios: Partial<Pick<Respuesta, 'estado' | 'observacion' | 'notaInterna'>>): void {
    const id = this.idActivo();
    const ahora = new Date().toISOString();
    this.mutarLocal(id, (r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) respuestas[f] = { ...(respuestas[f] ?? respuestaVacia()), ...cambios, actualizado: ahora };
      return { ...r, respuestas };
    });

    const patch = (c: object) => this.enviar(id, () => this.http.patch(this.url(id, '/respuestas'), { filas, cambios: c }));
    if ('estado' in cambios) patch({ estado: cambios.estado ?? null });
    for (const campo of ['observacion', 'notaInterna'] as CampoTexto[]) {
      if (cambios[campo] === undefined) continue;
      const valor = cambios[campo];
      if (filas.length === 1) this.textoEnEspera(id, filas[0], campo, () => patch({ [campo]: valor }));
      else {
        // Un cambio masivo reemplaza lo que hubiera en espera para esas filas.
        for (const f of filas) this.cancelarTexto(id, f, campo);
        patch({ [campo]: valor });
      }
    }
  }

  /** Agrupa las pulsaciones de teclado: solo se envía el último valor. */
  private textoEnEspera(id: string, fila: number, campo: CampoTexto, enviar: () => void): void {
    const clave = `${id}|${fila}|${campo}`;
    this.cancelarTexto(id, fila, campo);
    const ejecutar = () => {
      this.textos.delete(clave);
      enviar();
    };
    this.textos.set(clave, { timer: setTimeout(ejecutar, ESPERA_TEXTO_MS), enviar: ejecutar });
    if (!this.enCurso) this.estadoSync.set('pendiente');
  }

  private cancelarTexto(id: string, fila: number, campo: CampoTexto): void {
    const clave = `${id}|${fila}|${campo}`;
    const t = this.textos.get(clave);
    if (t) clearTimeout(t.timer);
    this.textos.delete(clave);
  }

  // ---------- evidencias ----------
  /** Agrega una evidencia; si la URL ya existe en el registro, devuelve la existente. */
  agregarEvidencia(datos: Omit<Evidencia, 'id'>): Evidencia {
    const reg = this.activo();
    if (!reg) throw new Error('No hay registro activo');
    const url = normalizarUrl(datos.url);
    const existente = reg.evidencias.find((e) => normalizarUrl(e.url) === url);
    if (existente) return existente;
    const ev: Evidencia = { ...datos, url, id: nuevoId() };
    this.mutarLocal(reg.id, (r) => ({ ...r, evidencias: [...r.evidencias, ev] }));
    this.enviar(reg.id, () => this.http.post<Evidencia>(this.url(reg.id, '/evidencias'), ev)).then((guardada) => {
      // Otra persona registró la misma URL al mismo tiempo: se toma la versión del servidor.
      if (guardada && guardada.id !== ev.id) this.refrescar(reg.id);
    });
    return ev;
  }

  editarEvidencia(evId: string, cambios: Partial<Evidencia>): void {
    const id = this.idActivo();
    this.mutarLocal(id, (r) => ({
      ...r,
      evidencias: r.evidencias.map((e) => (e.id === evId ? { ...e, ...cambios, id: evId } : e)),
    }));
    const cuerpo: Record<string, unknown> = {};
    if (cambios.titulo !== undefined) cuerpo['titulo'] = cambios.titulo;
    if (cambios.url !== undefined) cuerpo['url'] = cambios.url;
    if ('descripcion' in cambios) cuerpo['descripcion'] = cambios.descripcion ?? null;
    if ('verificacion' in cambios) cuerpo['verificacion'] = cambios.verificacion ?? null;
    this.enviar(id, () => this.http.patch(this.url(id, `/evidencias/${encodeURIComponent(evId)}`), cuerpo));
  }

  eliminarEvidencia(evId: string): void {
    const id = this.idActivo();
    this.mutarLocal(id, (r) => {
      const respuestas: Record<number, Respuesta> = {};
      for (const [f, resp] of Object.entries(r.respuestas))
        respuestas[+f] = { ...resp, evidencias: resp.evidencias.filter((x) => x !== evId) };
      return { ...r, respuestas, evidencias: r.evidencias.filter((e) => e.id !== evId) };
    });
    this.enviar(id, () => this.http.delete(this.url(id, `/evidencias/${encodeURIComponent(evId)}`)));
  }

  /** Asigna una evidencia a varios ítems a la vez. */
  asignarEvidencia(evId: string, filas: number[]): void {
    if (!filas.length) return;
    const id = this.idActivo();
    const ahora = new Date().toISOString();
    this.mutarLocal(id, (r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) {
        const actual = respuestas[f] ?? respuestaVacia();
        if (!actual.evidencias.includes(evId))
          respuestas[f] = { ...actual, evidencias: [...actual.evidencias, evId], actualizado: ahora };
      }
      return { ...r, respuestas };
    });
    this.enviar(id, () => this.http.post(this.url(id, `/evidencias/${encodeURIComponent(evId)}/asignar`), { filas }));
  }

  quitarEvidencia(evId: string, filas: number[]): void {
    if (!filas.length) return;
    const id = this.idActivo();
    this.mutarLocal(id, (r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) {
        const actual = respuestas[f];
        if (actual) respuestas[f] = { ...actual, evidencias: actual.evidencias.filter((x) => x !== evId) };
      }
      return { ...r, respuestas };
    });
    this.enviar(id, () => this.http.post(this.url(id, `/evidencias/${encodeURIComponent(evId)}/quitar`), { filas }));
  }

  /** Filas de ítems que usan una evidencia. */
  usos(evId: string, reg: Registro | null = this.activo()): number[] {
    if (!reg) return [];
    return Object.entries(reg.respuestas)
      .filter(([, r]) => r.evidencias.includes(evId))
      .map(([f]) => +f)
      .sort((a, b) => a - b);
  }

  // ---------- respaldos ----------
  /** Todos los registros en un .json (mismo formato del antiguo archivo de datos). */
  async respaldoCompleto(): Promise<Blob> {
    await this.vaciar();
    const datos = await firstValueFrom(this.http.get('/api/respaldo'));
    return new Blob([JSON.stringify(datos, null, 1)], { type: 'application/json' });
  }

  /** Restaura un respaldo o migra el archivo de datos local (solo administradores). */
  async restaurar(texto: string): Promise<ResultadoRestauracion> {
    let datos: unknown;
    try {
      datos = JSON.parse(texto);
    } catch {
      throw new Error('El archivo no es un JSON válido.');
    }
    const r = await firstValueFrom(this.http.post<ResultadoRestauracion>('/api/respaldo', datos));
    await this.cargar();
    return r;
  }
}
