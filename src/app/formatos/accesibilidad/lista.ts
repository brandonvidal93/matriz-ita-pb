import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService, mensajeError } from '../../core/auth.service';
import { Esqueleto } from '../../core/esqueleto';
import { enfocarTitulo } from '../../core/foco';
import { FechaPipe } from '../../core/idioma';
import { descargar } from '../../core/progreso';
import { ConfirmarDialog } from '../../dialogos/dialogos';
import { EvaluacionesService } from './evaluaciones.service';
import { exportarEvaluacion, nombreArchivoAcc } from './exportar';
import { CHIP_NIVEL, consolidado } from './catalogo';
import { Evaluacion } from './modelo';

@Component({
  imports: [Esqueleto, FechaPipe, RouterLink, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, TranslocoPipe],
  templateUrl: './lista.html',
})
export class ListaAccPage {
  protected svc = inject(EvaluacionesService);
  protected auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);

  cargando = signal(false);
  error = signal<string | null>(null);
  resumen = (e: Evaluacion) => consolidado(e);
  chip = CHIP_NIVEL;

  constructor() {
    this.recargar();
  }

  async recargar() {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.svc.cargar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private fallo(clave: string, e: unknown) {
    this.snack.open(this.t.translate(clave, { error: mensajeError(e) }), this.t.translate('comun.cerrar'));
  }

  async nueva() {
    try {
      const e = await this.svc.crear();
      this.router.navigate(['/accesibilidad/e', e.id]);
    } catch (e) {
      this.fallo('acc.lista.errorCrear', e);
    }
  }

  async exportar(e: Evaluacion) {
    try {
      descargar(await exportarEvaluacion(e), nombreArchivoAcc(e));
    } catch (err) {
      this.fallo('acc.errorExportar', err);
    }
  }

  async eliminar(e: Evaluacion) {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmarDialog, {
          data: {
            titulo: this.t.translate('acc.lista.eliminarTitulo'),
            mensaje: this.t.translate('acc.lista.eliminarMensaje', { n: e.ticket }),
            accion: this.t.translate('comun.eliminar'),
          },
        })
        .afterClosed(),
    );
    if (!ok) return;
    try {
      await this.svc.eliminar(e.id);
      enfocarTitulo(); // El menú desde el que se eliminó ya no existe.
    } catch (err) {
      this.fallo('acc.lista.errorEliminar', err);
    }
  }
}
