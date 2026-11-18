import { Component, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * Botón para mostrar u ocultar la contraseña de un campo. Se usa como sufijo:
 *   <input matInput #c type="password" … /> <ita-ver-clave matSuffix [campo]="c" />
 * Es un botón de alternancia: el nombre accesible no cambia y `aria-pressed` indica el estado.
 */
@Component({
  selector: 'ita-ver-clave',
  imports: [MatButtonModule, MatIconModule, TranslocoPipe],
  templateUrl: './ver-clave.html',
})
export class VerClave {
  campo = input.required<HTMLInputElement>();
  visible = signal(false);

  alternar() {
    this.visible.update((v) => !v);
    this.campo().type = this.visible() ? 'text' : 'password';
  }
}
