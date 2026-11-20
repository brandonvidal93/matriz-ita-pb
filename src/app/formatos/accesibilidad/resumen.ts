import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AVISO_ERROR } from '../../core/avisos';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { mensajeError } from '../../core/auth.service';
import { descargar } from '../../core/progreso';
import { CATALOGO_ACC, CHIP_NIVEL, PRINCIPIOS, consolidado, hallazgosGenerados, planCompleto, problemasCriterio } from './catalogo';
import { EvaluacionesService } from './evaluaciones.service';
import { exportarEvaluacion, nombreArchivoAcc } from './exportar';
import { Nivel } from './modelo';

/** Revisar y exportar: indicadores, consolidado por nivel, avance por principio y criterios por revisar (como en ITA). */
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
export class ResumenAccPage {
  protected svc = inject(EvaluacionesService);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  exportando = signal(false);
  limite = signal(50);
  niveles: Nivel[] = ['A', 'AA', 'AAA'];
  chip = CHIP_NIVEL;

  total = computed(() => consolidado(this.svc.activa()!));
  porPrincipio = computed(() => PRINCIPIOS.map((p) => ({ ...p, c: consolidado(this.svc.activa()!, p.criterios) })));
  maxHallazgos = CATALOGO_ACC.maxHallazgos;
  hallazgos = computed(() => {
    const hs = hallazgosGenerados(this.svc.activa()!);
    return { total: hs.length, sinPlan: hs.filter((h) => !planCompleto(h)).length };
  });
  pendientes = computed(() => {
    const ev = this.svc.activa()!;
    return CATALOGO_ACC.criterios
      .map((it) => ({ it, p: problemasCriterio(ev.criterios[it.fila]) }))
      .filter((x) => x.p.length)
      .map((x) => ({ fila: x.it.fila, texto: `${x.it.principio} › ${x.it.sc} ${x.it.criterio}`, motivos: x.p.map((p) => 'acc.problema.' + p) }));
  });

  formato(f: 'url' | 'titulo-url') {
    this.svc.cambiar({ formatoEvidencias: f });
  }

  async exportar() {
    if (this.exportando()) return;
    this.exportando.set(true);
    try {
      await this.svc.vaciar();
      const ev = this.svc.activa()!;
      descargar(await exportarEvaluacion(ev), nombreArchivoAcc(ev));
    } catch (e) {
      this.snack.open(this.t.translate('resumen.exportar.error', { error: mensajeError(e) }), this.t.translate('comun.cerrar'), AVISO_ERROR);
    } finally {
      this.exportando.set(false);
    }
  }
}
