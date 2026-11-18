import { InjectionToken, Signal } from '@angular/core';
import { Evidencia } from './modelos';

/** Elemento al que se puede asignar una evidencia (un ítem de ITA, un criterio, un hallazgo…). */
export interface Destino {
  /** Identificador dentro del formato (en ITA, la fila). */
  clave: string;
  /** Texto oficial del elemento, en español. */
  texto: string;
  /** Ubicación corta, p. ej. "Fila 14" o "SC1.1.1". */
  etiqueta: string;
}

export interface GrupoDestinos {
  clave: string;
  titulo: string;
  items: Destino[];
}

/**
 * Lo que necesitan la página de evidencias y sus diálogos para trabajar con cualquier formato.
 * Cada formato la provee en su ruta `r/:id` con el token FUENTE_EVIDENCIAS.
 */
export interface FuenteEvidencias {
  soloLectura: Signal<boolean>;
  /** Nombre del registro, para el título accesible de la tabla. */
  nombre(): string;
  evidencias(): Evidencia[];
  /** Agrega una evidencia; si la URL ya existe en el registro, devuelve la existente. */
  agregar(datos: Omit<Evidencia, 'id'>): Evidencia;
  editar(evId: string, cambios: Partial<Evidencia>): void;
  eliminar(evId: string): void;
  asignar(evId: string, claves: string[]): void;
  quitar(evId: string, claves: string[]): void;
  /** Claves de los elementos que usan la evidencia. */
  usos(evId: string): string[];
  grupos(): GrupoDestinos[];
  /** Enlace a donde se diligencia el elemento. */
  enlace(clave: string): { ruta: unknown[]; queryParams: Record<string, string | number> };
  /** Texto corto del elemento para listarlo junto a la evidencia. */
  descripcion(clave: string): string;
}

export const FUENTE_EVIDENCIAS = new InjectionToken<FuenteEvidencias>('FuenteEvidencias');
