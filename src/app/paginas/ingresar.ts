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
  templateUrl: './ingresar.html',
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
