import { Injectable, signal } from '@angular/core';
import { Registro } from './modelos';

/** Contenido del archivo de datos en disco. */
export interface ArchivoDatos {
  app: 'matriz-ita';
  formato: 1;
  guardado: string;
  registros: Registro[];
}

export type EstadoArchivo = 'sin-archivo' | 'requiere-permiso' | 'vinculado';

const DB = 'matriz-ita';
const STORE = 'handles';
const CLAVE = 'archivo-datos';
const TIPOS = [{ description: 'Datos Matriz ITA', accept: { 'application/json': ['.json'] } }];

function idb<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((ok, fallo) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onerror = () => fallo(req.error);
    req.onsuccess = () => {
      try {
        const tx = req.result.transaction(STORE, modo);
        const r = fn(tx.objectStore(STORE));
        r.onsuccess = () => ok(r.result);
        r.onerror = () => fallo(r.error);
      } catch (e) {
        fallo(e);
      }
    };
  });
}

/**
 * Lectura y escritura de un archivo JSON local con la File System Access API
 * (Chrome y Edge). El vínculo al archivo se recuerda entre sesiones; el
 * navegador pide confirmar el permiso al volver a abrir la app.
 */
@Injectable({ providedIn: 'root' })
export class ArchivoService {
  readonly soportado = typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  readonly estado = signal<EstadoArchivo>('sin-archivo');
  readonly nombre = signal<string | null>(null);
  private handle: any = null;

  /** Recupera el archivo vinculado en una sesión anterior (sin pedir permiso). */
  async restaurar(): Promise<ArchivoDatos | null> {
    if (!this.soportado) return null;
    try {
      const h = await idb<any>('readonly', (s) => s.get(CLAVE));
      if (!h) return null;
      this.handle = h;
      this.nombre.set(h.name);
      if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') {
        this.estado.set('vinculado');
        return this.leer();
      }
      this.estado.set('requiere-permiso');
    } catch {
      /* sin IndexedDB o handle inválido */
    }
    return null;
  }

  /** Debe llamarse desde un clic del usuario. */
  async reconectar(): Promise<ArchivoDatos | null> {
    if (!this.handle) return null;
    if ((await this.handle.requestPermission({ mode: 'readwrite' })) !== 'granted') return null;
    this.estado.set('vinculado');
    return this.leer();
  }

  async abrir(): Promise<ArchivoDatos> {
    const [h] = await (window as any).showOpenFilePicker({ types: TIPOS, multiple: false });
    await this.vincular(h);
    return this.leer();
  }

  async crear(datos: ArchivoDatos): Promise<void> {
    const h = await (window as any).showSaveFilePicker({ suggestedName: 'matriz-ita-datos.json', types: TIPOS });
    await this.vincular(h);
    await this.escribir(datos);
  }

  private async vincular(h: any): Promise<void> {
    if ((await h.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('Permiso de escritura denegado');
    this.handle = h;
    this.nombre.set(h.name);
    this.estado.set('vinculado');
    try {
      await idb('readwrite', (s) => s.put(h, CLAVE));
    } catch {}
  }

  async desvincular(): Promise<void> {
    this.handle = null;
    this.nombre.set(null);
    this.estado.set('sin-archivo');
    try {
      await idb('readwrite', (s) => s.delete(CLAVE));
    } catch {}
  }

  async leer(): Promise<ArchivoDatos> {
    const f: File = await this.handle.getFile();
    const texto = await f.text();
    if (!texto.trim()) return { app: 'matriz-ita', formato: 1, guardado: '', registros: [] };
    return validar(JSON.parse(texto));
  }

  async escribir(datos: ArchivoDatos): Promise<void> {
    if (this.estado() !== 'vinculado') return;
    const w = await this.handle.createWritable();
    await w.write(JSON.stringify(datos, null, 1));
    await w.close();
  }
}

export function validar(d: any): ArchivoDatos {
  // Acepta también un respaldo de un solo registro.
  if (d && d.respuestas && Array.isArray(d.evidencias)) d = { app: 'matriz-ita', formato: 1, guardado: '', registros: [d] };
  if (!d || !Array.isArray(d.registros)) throw new Error('El archivo no es de datos de la Matriz ITA.');
  return d as ArchivoDatos;
}
