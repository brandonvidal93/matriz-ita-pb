/** Ítem de la matriz oficial (extraído de la plantilla, no editable). */
export interface ItemCatalogo {
  fila: number;
  grupo: string;
  nivel1: string;
  nivel2: string;
  item: string;
  explicacion: string;
  normatividad: string;
  tipo: 'cumplimiento' | 'numero';
}

export interface Catalogo {
  version: string;
  hoja: string;
  columnas: { si: string; no: string; na: string; observacion: string };
  items: ItemCatalogo[];
}

export type EstadoCumplimiento = 'SI' | 'NO' | 'NA';

/** Evidencia reutilizable: una URL puede respaldar varios ítems. */
export interface Evidencia {
  id: string;
  titulo: string;
  url: string;
  descripcion?: string;
  /** Resultado de la última verificación de disponibilidad. */
  verificacion?: { fecha: string; estado: 'ok' | 'error' | 'desconocido'; detalle?: string };
}

export interface Respuesta {
  estado: EstadoCumplimiento | null;
  /** Justificación u observación que irá en la columna I. */
  observacion: string;
  /** Ids de evidencias asociadas, en el orden en que se listan. */
  evidencias: string[];
  /** Nota de trabajo; NO se exporta al archivo oficial. */
  notaInterna?: string;
  actualizado?: string;
}

export type TipoCorte = 'procuraduria' | 'seguimiento';

/** Un diligenciamiento completo de la matriz (un corte). */
export interface Registro {
  id: string;
  nombre: string;
  tipo: TipoCorte;
  vigencia: number;
  /** p. ej. "1.er semestre"; libre. */
  periodo?: string;
  versionMatriz: string;
  creado: string;
  actualizado: string;
  respuestas: Record<number, Respuesta>;
  evidencias: Evidencia[];
  /** Cómo se presentan las evidencias en la columna I. */
  formatoEvidencias: 'url' | 'titulo-url';
}

export interface ResumenRegistro {
  id: string;
  nombre: string;
  tipo: TipoCorte;
  vigencia: number;
  periodo?: string;
  actualizado: string;
}

export function respuestaVacia(): Respuesta {
  return { estado: null, observacion: '', evidencias: [] };
}

export function nuevoId(): string {
  return (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).slice(0, 12);
}

/** Normaliza una URL de evidencia para detectar duplicados (quita espacios y puntuación final). */
export function normalizarUrl(u: string): string {
  return u.trim().replace(/[)\].,;]+$/, '');
}

/** Usuario autenticado tal como lo devuelve la API. */
export type Rol = 'admin' | 'editor' | 'lector';

export interface Usuario {
  id: number;
  usuario: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
  debeCambiarClave: boolean;
  /** Permiso efectivo en cada formato al que tiene acceso (el administrador los tiene todos). */
  formatos: Partial<Record<Formato, Permiso>>;
}

/** Formatos que se diligencian en la aplicación. El id se guarda en `registros.formato`. */
export const FORMATOS = ['ita'] as const;
export type Formato = (typeof FORMATOS)[number];
export type Permiso = 'ver' | 'editar';

/** Clave de traducción del nombre de cada rol (`rol.*` en public/i18n). */
export const claveRol = (r: Rol) => `rol.${r}`;
