import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { FechaPipe } from '../core/idioma';

/** Separado de `dialogos.ts` porque se usa fuera de las páginas y este archivo entra en el paquete inicial. */
@Component({
  imports: [FechaPipe, MatButtonModule, MatDialogModule, TranslocoPipe],
  templateUrl: './aviso-sesion.html',
})
export class AvisoSesionDialog {
  d = inject<{ vence: number }>(MAT_DIALOG_DATA);
}
