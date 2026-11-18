import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlmacenService } from '../../core/almacen.service';
import { SECCIONES, claveProblema, etiquetaCorta, problemas } from '../../core/catalogo';
import { descargar, nombreArchivo, progreso } from '../../core/progreso';
import { XlsxService } from '../../core/xlsx.service';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatRadioModule, TranslocoPipe],
  styles: `
    .cifra { font-size: 28px; font-weight: 700; line-height: 1.1; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #edf0f4; text-align: left; }
    th { font-size: 12px; color: var(--texto-suave); text-transform: uppercase; }
    td.n { text-align: right; font-variant-numeric: tabular-nums; }
  `,
  templateUrl: './resumen.html',
})
export class ResumenPage {
  protected almacen = inject(AlmacenService);
  private xlsx = inject(XlsxService);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  exportando = signal(false);
  limite = signal(50);

  total = computed(() => progreso(this.almacen.activo()!));
  porSeccion = computed(() => SECCIONES.map((s) => ({ ...s, p: progreso(this.almacen.activo()!, s.items) })));
  pendientes = computed(() => {
    const reg = this.almacen.activo()!;
    return SECCIONES.flatMap((s) =>
      s.items
        .map((it) => ({ it, p: problemas(it, reg.respuestas[it.fila]) }))
        .filter((x) => x.p.length)
        .map((x) => ({ fila: x.it.fila, texto: `${s.titulo.slice(0, 45)} › ${etiquetaCorta(x.it, 100)}`, motivos: x.p.map(claveProblema) })),
    );
  });

  async exportar() {
    if (this.exportando()) return;
    const reg = this.almacen.activo()!;
    this.exportando.set(true);
    try {
      const blob = await this.xlsx.exportar(reg);
      const nombre = nombreArchivo(reg, 'xlsx');
      descargar(blob, nombre);
    } catch (e: any) {
      this.snack.open(this.t.translate('resumen.exportar.error', { error: e?.message ?? e }), this.t.translate('comun.cerrar'));
    } finally {
      this.exportando.set(false);
    }
  }
}
