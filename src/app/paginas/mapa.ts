import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlmacenService } from '../core/almacen.service';
import { AuthService, mensajeError } from '../core/auth.service';

/** Mapa del sitio (numeral 1.6 del Anexo 1 de la Resolución MinTIC 1519 de 2020 y WCAG 2.4.5). */
@Component({
  imports: [RouterLink, MatButtonModule, TranslocoPipe],
  templateUrl: './mapa.html',
})
export class MapaPage {
  protected almacen = inject(AlmacenService);
  protected auth = inject(AuthService);
  error = signal<string | null>(null);

  constructor() {
    this.cargar();
  }

  async cargar() {
    this.error.set(null);
    try {
      await this.almacen.asegurarCargado();
    } catch (e) {
      this.error.set(mensajeError(e));
    }
  }
}
