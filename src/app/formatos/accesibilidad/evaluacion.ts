import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { mensajeError } from '../../core/auth.service';
import { descargar } from '../../core/progreso';
import { EvaluacionesService } from './evaluaciones.service';
import { exportarEvaluacion, nombreArchivoAcc } from './exportar';
import { CHIP_NIVEL, consolidado } from './catalogo';

/** Marco de una evaluación: datos básicos, navegación entre hojas y exportación. */
@Component({
  imports: [RouterLink, RouterLinkActive, RouterOutlet, MatButtonModule, MatIconModule, TranslocoPipe],
  styles: `
    nav a { padding: 8px 12px; border-radius: 8px; font-weight: 500; text-decoration: none; color: inherit; }
    nav a:hover { background: #e6e9ee; }
    nav a.activo { background: #dfe7f3; color: var(--pb-azul); text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
  `,
  templateUrl: './evaluacion.html',
})
export class EvaluacionPage {
  protected svc = inject(EvaluacionesService);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  resumen = computed(() => consolidado(this.svc.activa() ?? { criterios: {} }));
  chip = CHIP_NIVEL;

  async exportar() {
    const ev = this.svc.activa();
    if (!ev) return;
    try {
      await this.svc.vaciar();
      descargar(await exportarEvaluacion(this.svc.activa() ?? ev), nombreArchivoAcc(ev));
    } catch (e) {
      this.snack.open(this.t.translate('acc.errorExportar', { error: mensajeError(e) }), this.t.translate('comun.cerrar'));
    }
  }
}
