import { Component, input } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

/** Marcador de carga con forma de lista de tarjetas. Aparece tras `--espera` para no parpadear si la carga es rápida. */
@Component({
  selector: 'app-esqueleto',
  imports: [TranslocoPipe],
  styles: `
    :host { display: block; animation: aparecer 0s var(--espera, 300ms) both; }
    @keyframes aparecer { from { visibility: hidden; } }
  `,
  templateUrl: './esqueleto.html',
})
export class Esqueleto {
  filas = input(3);
  protected lista = () => Array.from({ length: this.filas() });
}
