import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Formato, Permiso, Usuario } from './modelos';

/** Mensaje legible de un error de la API. */
export function mensajeError(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 0) return 'No hay conexión con el servidor.';
    return e.error?.error ?? `Error ${e.status} del servidor.`;
  }
  return (e as any)?.message ?? String(e);
}

/** Sesión del usuario actual. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  readonly usuario = signal<Usuario | null>(null);
  /** true cuando ya se consultó al servidor si hay sesión. */
  readonly verificado = signal(false);

  readonly esAdmin = computed(() => this.usuario()?.rol === 'admin');
  /** Edición de la matriz ITA, el formato que maneja AlmacenService. */
  readonly puedeEditar = computed(() => this.puede('ita', 'editar'));

  /** Permiso efectivo en un formato, calculado por el servidor (que vuelve a validarlo en cada petición). */
  puede(formato: Formato, permiso: Permiso): boolean {
    const p = this.usuario()?.formatos?.[formato];
    return permiso === 'ver' ? !!p : p === 'editar';
  }

  /** Consulta la sesión actual una sola vez (las siguientes llamadas devuelven el resultado guardado). */
  private consulta: Promise<Usuario | null> | null = null;
  asegurarSesion(): Promise<Usuario | null> {
    this.consulta ??= firstValueFrom(this.http.get<Usuario>('/api/auth/yo'))
      .catch(() => null)
      .then((u) => {
        this.usuario.set(u);
        this.verificado.set(true);
        return u;
      });
    return this.consulta;
  }

  async ingresar(usuario: string, clave: string): Promise<Usuario> {
    const u = await firstValueFrom(this.http.post<Usuario>('/api/auth/ingresar', { usuario, clave }));
    this.establecer(u);
    return u;
  }

  async cambiarClave(actual: string, nueva: string): Promise<void> {
    this.establecer(await firstValueFrom(this.http.post<Usuario>('/api/auth/clave', { actual, nueva })));
  }

  async salir(): Promise<void> {
    try {
      await firstValueFrom(this.http.post('/api/auth/salir', {}));
    } finally {
      this.sesionTerminada();
    }
  }

  /** Llamado cuando el servidor responde 401: la sesión venció o fue cerrada. */
  sesionTerminada(): void {
    this.establecer(null);
  }

  private establecer(u: Usuario | null): void {
    this.usuario.set(u);
    this.verificado.set(true);
    this.consulta = Promise.resolve(u);
  }
}
