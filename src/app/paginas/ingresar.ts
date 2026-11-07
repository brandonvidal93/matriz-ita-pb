import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService, mensajeError } from '../core/auth.service';
import { AlmacenService } from '../core/almacen.service';
import { CONFIG } from '../config';

/** Política de contraseñas (la misma que valida el servidor). */
export function problemaClave(c: string): string | null {
  if (c.length < 10) return 'Debe tener al menos 10 caracteres.';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) return 'Debe combinar letras y números.';
  return null;
}

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule],
  template: `
    <div class="min-h-[70vh] grid place-items-center px-4 py-10">
      <section class="tarjeta p-6 w-full max-w-[420px]" aria-labelledby="t-ingreso">
        <div class="text-xs texto-suave">{{ institucion }} · {{ dependencia }}</div>
        @if (!cambiando()) {
          <h1 id="t-ingreso" class="text-2xl font-semibold mt-1 mb-4">Ingresar a la Matriz ITA</h1>
          @if (vencida()) { <p class="chip-estado pendiente !rounded-lg !py-2 !px-3 !font-normal" role="status">Tu sesión terminó. Vuelve a ingresar.</p> }
          <form (ngSubmit)="ingresar()" class="grid gap-3">
            <mat-form-field class="sin-pie">
              <mat-label>Usuario</mat-label>
              <input matInput name="usuario" autocomplete="username" [(ngModel)]="usuario" required autofocus />
            </mat-form-field>
            <mat-form-field class="sin-pie">
              <mat-label>Contraseña</mat-label>
              <input matInput name="clave" type="password" autocomplete="current-password" [(ngModel)]="clave" required />
            </mat-form-field>
            @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
            <button mat-flat-button type="submit" [disabled]="enviando() || !usuario || !clave">{{ enviando() ? 'Ingresando…' : 'Ingresar' }}</button>
          </form>
        } @else {
          <h1 id="t-ingreso" class="text-2xl font-semibold mt-1 mb-1">Cambia tu contraseña</h1>
          <p class="texto-suave text-sm mt-0 mb-4">
            {{ auth.usuario()?.nombre }}, por seguridad debes definir una contraseña personal antes de continuar.
          </p>
          <form (ngSubmit)="cambiar()" class="grid gap-3">
            <mat-form-field class="sin-pie">
              <mat-label>Contraseña actual</mat-label>
              <input matInput name="actual" type="password" autocomplete="current-password" [(ngModel)]="actual" required />
            </mat-form-field>
            <mat-form-field>
              <mat-label>Nueva contraseña</mat-label>
              <input matInput name="nueva" type="password" autocomplete="new-password" [(ngModel)]="nueva" required />
              <mat-hint>Mínimo 10 caracteres, con letras y números.</mat-hint>
            </mat-form-field>
            <mat-form-field class="sin-pie">
              <mat-label>Repite la nueva contraseña</mat-label>
              <input matInput name="nueva2" type="password" autocomplete="new-password" [(ngModel)]="nueva2" required />
            </mat-form-field>
            @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
            <button mat-flat-button type="submit" [disabled]="enviando()">{{ enviando() ? 'Guardando…' : 'Guardar y continuar' }}</button>
            <button mat-button type="button" (click)="salir()">Salir</button>
          </form>
        }
      </section>
    </div>
  `,
})
export class IngresarPage {
  /** Parámetros de consulta. */
  volver = input<string>();
  vencida = input<string>();

  protected auth = inject(AuthService);
  private almacen = inject(AlmacenService);
  private router = inject(Router);
  institucion = CONFIG.institucion;
  dependencia = CONFIG.dependencia;

  usuario = '';
  clave = '';
  actual = '';
  nueva = '';
  nueva2 = '';
  error = signal<string | null>(null);
  enviando = signal(false);
  cambiando = computed(() => !!this.auth.usuario()?.debeCambiarClave);

  constructor() {
    this.auth.asegurarSesion().then((u) => {
      if (u && !u.debeCambiarClave) this.continuar();
    });
  }

  async ingresar() {
    this.error.set(null);
    this.enviando.set(true);
    try {
      const u = await this.auth.ingresar(this.usuario, this.clave);
      this.clave = '';
      this.actual = '';
      this.almacen.limpiar();
      if (!u.debeCambiarClave) this.continuar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async cambiar() {
    const p = problemaClave(this.nueva);
    if (p) return this.error.set(p);
    if (this.nueva !== this.nueva2) return this.error.set('Las contraseñas nuevas no coinciden.');
    this.error.set(null);
    this.enviando.set(true);
    try {
      await this.auth.cambiarClave(this.actual, this.nueva);
      this.continuar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  async salir() {
    await this.auth.salir();
    this.almacen.limpiar();
  }

  private continuar() {
    const destino = this.volver();
    // Solo rutas internas de la app.
    this.router.navigateByUrl(destino?.startsWith('/') && !destino.startsWith('//') ? destino : '/');
  }
}
