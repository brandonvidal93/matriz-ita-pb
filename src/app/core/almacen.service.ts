import { Injectable, computed, inject, signal } from '@angular/core';
import { CATALOGO } from './catalogo';
import { DriveService } from './drive.service';
import { Evidencia, Registro, Respuesta, TipoCorte, nuevoId, respuestaVacia } from './modelos';

const CLAVE_LOCAL = 'matriz-ita:registros:v1';

export type EstadoSync = 'local' | 'pendiente' | 'sincronizando' | 'sincronizado' | 'error';

function normalizarUrl(u: string): string {
  return u.trim().replace(/[)\].,;]+$/, '');
}

/**
 * Estado central de la aplicación. Persiste siempre en el navegador
 * (respaldo inmediato) y, si hay sesión de Google, en Drive.
 */
@Injectable({ providedIn: 'root' })
export class AlmacenService {
  private drive = inject(DriveService);

  readonly registros = signal<Registro[]>(this.leerLocal());
  readonly activoId = signal<string | null>(null);
  readonly activo = computed(() => this.registros().find((r) => r.id === this.activoId()) ?? null);
  readonly estadoSync = signal<EstadoSync>('local');
  readonly errorSync = signal<string | null>(null);

  private pendientes = new Set<string>();
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  // ---------- persistencia ----------
  private leerLocal(): Registro[] {
    try {
      const raw = localStorage.getItem(CLAVE_LOCAL);
      return raw ? (JSON.parse(raw) as Registro[]) : [];
    } catch {
      return [];
    }
  }

  private tLocal: ReturnType<typeof setTimeout> | null = null;
  private escribirLocal(): void {
    if (this.tLocal) clearTimeout(this.tLocal);
    this.tLocal = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.registros()));
      } catch {
        /* almacenamiento no disponible: se conserva en memoria */
      }
    }, 250);
  }

  constructor() {
    // Guardar antes de cerrar la pestaña si hay escritura pendiente.
    addEventListener('beforeunload', () => {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.registros()));
      } catch {}
    });
  }

  private programarSync(id: string): void {
    if (!this.drive.conectado()) return;
    this.pendientes.add(id);
    this.estadoSync.set('pendiente');
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = setTimeout(() => this.sincronizarPendientes(), 1500);
  }

  async sincronizarPendientes(): Promise<void> {
    if (!this.drive.conectado() || !this.pendientes.size) return;
    this.estadoSync.set('sincronizando');
    try {
      for (const id of [...this.pendientes]) {
        const reg = this.registros().find((r) => r.id === id);
        if (reg) await this.drive.guardar(reg);
        this.pendientes.delete(id);
      }
      this.estadoSync.set('sincronizado');
      this.errorSync.set(null);
    } catch (e: any) {
      this.estadoSync.set('error');
      this.errorSync.set(e?.message ?? String(e));
    }
  }

  /** Une lo que hay en Drive con lo local, quedándose con la versión más reciente. */
  async conectarDrive(): Promise<void> {
    await this.drive.conectar();
    this.estadoSync.set('sincronizando');
    try {
      const remotos = await this.drive.listar();
      const locales = this.registros();
      const mapa = new Map<string, Registro>();
      for (const r of remotos) mapa.set(r.id, r);
      for (const l of locales) {
        const r = mapa.get(l.id);
        if (!r || l.actualizado > r.actualizado) {
          mapa.set(l.id, l);
          this.pendientes.add(l.id);
        }
      }
      this.registros.set([...mapa.values()].sort((a, b) => b.actualizado.localeCompare(a.actualizado)));
      this.escribirLocal();
      await this.sincronizarPendientes();
      this.estadoSync.set('sincronizado');
    } catch (e: any) {
      this.estadoSync.set('error');
      this.errorSync.set(e?.message ?? String(e));
      throw e;
    }
  }

  desconectarDrive(): void {
    this.drive.desconectar();
    this.estadoSync.set('local');
  }

  private mutar(id: string, fn: (r: Registro) => Registro): void {
    this.registros.update((lista) =>
      lista.map((r) => (r.id === id ? { ...fn(r), actualizado: new Date().toISOString() } : r)),
    );
    this.escribirLocal();
    this.programarSync(id);
  }

  private mutarActivo(fn: (r: Registro) => Registro): void {
    const id = this.activoId();
    if (id) this.mutar(id, fn);
  }

  // ---------- registros ----------
  crear(
    datos: { nombre: string; tipo: TipoCorte; vigencia: number; periodo?: string },
    base?: Pick<Registro, 'respuestas' | 'evidencias'> & Partial<Registro>,
  ): Registro {
    const ahora = new Date().toISOString();
    const reg: Registro = {
      id: nuevoId(),
      nombre: datos.nombre,
      tipo: datos.tipo,
      vigencia: datos.vigencia,
      periodo: datos.periodo,
      versionMatriz: CATALOGO.version,
      creado: ahora,
      actualizado: ahora,
      respuestas: base ? structuredClone(base.respuestas) : {},
      evidencias: base ? structuredClone(base.evidencias).map((e) => ({ ...e, verificacion: undefined })) : [],
      formatoEvidencias: base?.formatoEvidencias ?? 'url',
    };
    this.agregarRegistro(reg);
    return reg;
  }

  agregarRegistro(reg: Registro): void {
    this.registros.update((l) => [reg, ...l]);
    this.escribirLocal();
    this.programarSync(reg.id);
  }

  renombrar(id: string, datos: Partial<Pick<Registro, 'nombre' | 'tipo' | 'vigencia' | 'periodo' | 'formatoEvidencias'>>): void {
    this.mutar(id, (r) => ({ ...r, ...datos }));
  }

  async eliminar(id: string): Promise<void> {
    this.registros.update((l) => l.filter((r) => r.id !== id));
    this.escribirLocal();
    if (this.drive.conectado()) await this.drive.eliminar(id);
  }

  // ---------- respuestas ----------
  respuesta(fila: number): Respuesta {
    return this.activo()?.respuestas[fila] ?? respuestaVacia();
  }

  actualizarRespuesta(fila: number, cambios: Partial<Respuesta>): void {
    this.actualizarVarias([fila], cambios);
  }

  actualizarVarias(filas: number[], cambios: Partial<Respuesta>): void {
    const ahora = new Date().toISOString();
    this.mutarActivo((r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) respuestas[f] = { ...(respuestas[f] ?? respuestaVacia()), ...cambios, actualizado: ahora };
      return { ...r, respuestas };
    });
  }

  // ---------- evidencias ----------
  /** Agrega una evidencia; si la URL ya existe, devuelve la existente. */
  agregarEvidencia(datos: Omit<Evidencia, 'id'>): Evidencia {
    const reg = this.activo();
    if (!reg) throw new Error('No hay registro activo');
    const url = normalizarUrl(datos.url);
    const existente = reg.evidencias.find((e) => normalizarUrl(e.url) === url);
    if (existente) return existente;
    const ev: Evidencia = { ...datos, url, id: nuevoId() };
    this.mutarActivo((r) => ({ ...r, evidencias: [...r.evidencias, ev] }));
    return ev;
  }

  editarEvidencia(id: string, cambios: Partial<Evidencia>): void {
    this.mutarActivo((r) => ({
      ...r,
      evidencias: r.evidencias.map((e) => (e.id === id ? { ...e, ...cambios, id } : e)),
    }));
  }

  eliminarEvidencia(id: string): void {
    this.mutarActivo((r) => {
      const respuestas: Record<number, Respuesta> = {};
      for (const [f, resp] of Object.entries(r.respuestas))
        respuestas[+f] = { ...resp, evidencias: resp.evidencias.filter((x) => x !== id) };
      return { ...r, respuestas, evidencias: r.evidencias.filter((e) => e.id !== id) };
    });
  }

  /** Asigna una evidencia a varios ítems a la vez. */
  asignarEvidencia(evId: string, filas: number[]): void {
    this.mutarActivo((r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) {
        const actual = respuestas[f] ?? respuestaVacia();
        if (!actual.evidencias.includes(evId))
          respuestas[f] = { ...actual, evidencias: [...actual.evidencias, evId], actualizado: new Date().toISOString() };
      }
      return { ...r, respuestas };
    });
  }

  quitarEvidencia(evId: string, filas: number[]): void {
    this.mutarActivo((r) => {
      const respuestas = { ...r.respuestas };
      for (const f of filas) {
        const actual = respuestas[f];
        if (actual) respuestas[f] = { ...actual, evidencias: actual.evidencias.filter((x) => x !== evId) };
      }
      return { ...r, respuestas };
    });
  }

  /** Filas de ítems que usan una evidencia. */
  usos(evId: string, reg: Registro | null = this.activo()): number[] {
    if (!reg) return [];
    return Object.entries(reg.respuestas)
      .filter(([, r]) => r.evidencias.includes(evId))
      .map(([f]) => +f)
      .sort((a, b) => a - b);
  }
}
