import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService, mensajeError } from '../core/auth.service';
import { AlmacenService } from '../core/almacen.service';
import { CONFIG } from '../config';

/** Política de contraseñas (la misma que valida el servidor). Devuelve la clave de traducción del problema. */
export function problemaClave(c: string): string | null {
  if (c.length < 10) return 'clave.corta';
  if (!/[A-Za-zÁÉÍÓÚáéíóúÑñ]/.test(c) || !/\d/.test(c)) return 'clave.letrasNumeros';
  return null;
}

@Component({
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoPipe],
  template: `
    <div class="min-h-[70vh] grid place-items-center px-4 py-10">
      <section class="tarjeta p-6 w-full max-w-[420px]" aria-labelledby="t-ingreso">
        <div class="text-xs texto-suave">{{ institucion }} · {{ dependencia }}</div>
        @if (!cambiando()) {
          <h1 id="t-ingreso" class="text-2xl font-semibold mt-1 mb-4">{{ 'ingresar.titulo' | transloco }}</h1>
          @if (vencida()) { <p class="chip-estado pendiente !rounded-lg !py-2 !px-3 !font-normal" role="status">{{ 'ingresar.sesionVencida' | transloco }}</p> }
          <form (ngSubmit)="ingresar()" class="grid gap-3">
            <mat-form-field class="sin-pie">
              <mat-label>{{ 'ingresar.usuario' | transloco }}</mat-label>
              <input matInput name="usuario" autocomplete="username" [(ngModel)]="usuario" required autofocus />
            </mat-form-field>
            <mat-form-field class="sin-pie">
              <mat-label>{{ 'ingresar.clave' | transloco }}</mat-label>
              <input matInput name="clave" type="password" autocomplete="current-password" [(ngModel)]="clave" required />
            </mat-form-field>
            @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
            <button mat-flat-button type="submit" [disabled]="enviando() || !usuario || !clave">{{ (enviando() ? 'ingresar.ingresando' : 'ingresar.ingresar') | transloco }}</button>
          </form>
        } @else {
          <h1 id="t-ingreso" class="text-2xl font-semibold mt-1 mb-1">{{ 'ingresar.cambiar.titulo' | transloco }}</h1>
          <p class="texto-suave text-sm mt-0 mb-4">
            {{ 'ingresar.cambiar.explicacion' | transloco: { nombre: auth.usuario()?.nombre } }}
          </p>
          <form (ngSubmit)="cambiar()" class="grid gap-3">
            <mat-form-field class="sin-pie">
              <mat-label>{{ 'ingresar.cambiar.actual' | transloco }}</mat-label>
              <input matInput name="actual" type="password" autocomplete="current-password" [(ngModel)]="actual" required />
            </mat-form-field>
            <mat-form-field>
              <mat-label>{{ 'ingresar.cambiar.nueva' | transloco }}</mat-label>
              <input matInput name="nueva" type="password" autocomplete="new-password" [(ngModel)]="nueva" required />
              <mat-hint>{{ 'ingresar.cambiar.pista' | transloco }}</mat-hint>
            </mat-form-field>
            <mat-form-field class="sin-pie">
              <mat-label>{{ 'ingresar.cambiar.repetir' | transloco }}</mat-label>
              <input matInput name="nueva2" type="password" autocomplete="new-password" [(ngModel)]="nueva2" required />
            </mat-form-field>
            @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
            <button mat-flat-button type="submit" [disabled]="enviando()">{{ (enviando() ? 'ingresar.cambiar.guardando' : 'ingresar.cambiar.guardar') | transloco }}</button>
            <button mat-button type="button" (click)="salir()">{{ 'comun.salir' | transloco }}</button>
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
  private t = inject(TranslocoService);
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
    if (p) return this.error.set(this.t.translate(p));
    if (this.nueva !== this.nueva2) return this.error.set(this.t.translate('ingresar.cambiar.noCoinciden'));
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
