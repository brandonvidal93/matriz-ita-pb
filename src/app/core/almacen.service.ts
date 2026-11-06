import { Injectable, computed, inject, signal } from '@angular/core';
import { ArchivoDatos, ArchivoService, validar } from './archivo.service';
import { CATALOGO } from './catalogo';
import { Evidencia, Registro, Respuesta, TipoCorte, nuevoId, respuestaVacia } from './modelos';

const CLAVE_LOCAL = 'matriz-ita:registros:v1';

export type EstadoSync = 'local' | 'pendiente' | 'guardando' | 'guardado' | 'error';

function normalizarUrl(u: string): string {
  return u.trim().replace(/[)\].,;]+$/, '');
}

/** Une dos listas de registros quedándose, por id, con la versión más reciente. */
function unir(a: Registro[], b: Registro[]): Registro[] {
  const mapa = new Map<string, Registro>();
  for (const r of [...a, ...b]) {
    const x = mapa.get(r.id);
    if (!x || r.actualizado > x.actualizado) mapa.set(r.id, r);
  }
  return [...mapa.values()].sort((x, y) => y.actualizado.localeCompare(x.actualizado));
}

/**
 * Estado central de la aplicación. Todo es local: se guarda en un archivo
 * JSON del equipo (si está vinculado) y, como respaldo, en el navegador.
 */
@Injectable({ providedIn: 'root' })
export class AlmacenService {
  readonly archivo = inject(ArchivoService);

  readonly registros = signal<Registro[]>(this.leerLocal());
  readonly activoId = signal<string | null>(null);
  readonly activo = computed(() => this.registros().find((r) => r.id === this.activoId()) ?? null);
  readonly estadoSync = signal<EstadoSync>('local');
  readonly errorSync = signal<string | null>(null);
  readonly ultimoGuardado = signal<string | null>(null);

  private tLocal: ReturnType<typeof setTimeout> | null = null;
  private tArchivo: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addEventListener('beforeunload', (ev) => {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.registros()));
      } catch {}
      if (this.estadoSync() === 'pendiente' || this.estadoSync() === 'guardando') ev.preventDefault();
    });
    this.archivo.restaurar().then((d) => d && this.aplicarArchivo(d));
  }

  // ---------- persistencia ----------
  private leerLocal(): Registro[] {
    try {
      const raw = localStorage.getItem(CLAVE_LOCAL);
      return raw ? (JSON.parse(raw) as Registro[]) : [];
    } catch {
      return [];
    }
  }

  private persistir(): void {
    if (this.tLocal) clearTimeout(this.tLocal);
    this.tLocal = setTimeout(() => {
      try {
        localStorage.setItem(CLAVE_LOCAL, JSON.stringify(this.registros()));
      } catch {
        /* almacenamiento no disponible: se conserva en memoria */
      }
    }, 250);
    if (this.archivo.estado() !== 'vinculado') return;
    this.estadoSync.set('pendiente');
    if (this.tArchivo) clearTimeout(this.tArchivo);
    this.tArchivo = setTimeout(() => this.guardarArchivo(), 800);
  }

  private datos(): ArchivoDatos {
    return { app: 'matriz-ita', formato: 1, guardado: new Date().toISOString(), registros: this.registros() };
  }

  async guardarArchivo(): Promise<void> {
    if (this.archivo.estado() !== 'vinculado') return;
    this.estadoSync.set('guardando');
    try {
      const d = this.datos();
      await this.archivo.escribir(d);
      this.ultimoGuardado.set(d.guardado);
      this.estadoSync.set('guardado');
      this.errorSync.set(null);
    } catch (e: any) {
      this.estadoSync.set('error');
      this.errorSync.set(e?.message ?? String(e));
    }
  }

  private async aplicarArchivo(d: ArchivoDatos): Promise<void> {
    const antes = JSON.stringify(d.registros);
    this.registros.set(unir(d.registros, this.registros()));
    this.ultimoGuardado.set(d.guardado || null);
    this.estadoSync.set('guardado');
    // Si en el navegador había cambios más recientes, se escriben al archivo.
    if (JSON.stringify(this.registros()) !== antes) await this.guardarArchivo();
    this.persistir();
  }

  async abrirArchivo(): Promise<void> {
    await this.aplicarArchivo(await this.archivo.abrir());
  }

  async crearArchivo(): Promise<void> {
    await this.archivo.crear(this.datos());
    this.estadoSync.set('guardado');
    this.ultimoGuardado.set(new Date().toISOString());
  }

  async reconectarArchivo(): Promise<void> {
    const d = await this.archivo.reconectar();
    if (d) await this.aplicarArchivo(d);
  }

  async desvincularArchivo(): Promise<void> {
    await this.archivo.desvincular();
    this.estadoSync.set('local');
  }

  /** Copia de todos los registros (alternativa si el navegador no soporta archivos). */
  copiaJson(): Blob {
    return new Blob([JSON.stringify(this.datos(), null, 1)], { type: 'application/json' });
  }

  /** Carga un JSON de datos o de respaldo y lo une con lo actual. Devuelve cuántos registros trajo. */
  cargarJson(texto: string): number {
    const d = validar(JSON.parse(texto));
    this.registros.set(unir(this.registros(), d.registros));
    this.persistir();
    return d.registros.length;
  }

  private mutar(id: string, fn: (r: Registro) => Registro): void {
    this.registros.update((lista) =>
      lista.map((r) => (r.id === id ? { ...fn(r), actualizado: new Date().toISOString() } : r)),
    );
    this.persistir();
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
    this.persistir();
  }

  renombrar(id: string, datos: Partial<Pick<Registro, 'nombre' | 'tipo' | 'vigencia' | 'periodo' | 'formatoEvidencias'>>): void {
    this.mutar(id, (r) => ({ ...r, ...datos }));
  }

  async eliminar(id: string): Promise<void> {
    this.registros.update((l) => l.filter((r) => r.id !== id));
    this.persistir();
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
