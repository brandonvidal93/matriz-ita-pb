import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { errorSi } from '../../core/foco';
import { EvaluacionesService } from './evaluaciones.service';
import { CATALOGO_ACC, consolidado } from './catalogo';
import { Criterio, Nivel, codigos, criterioVacio } from './modelo';

type Filtro = 'todos' | 'pendientes' | 'noCumple';

/** Hoja 2: estado de cada criterio y tabla de consolidado. */
@Component({
  imports: [FormsModule, TextFieldModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoPipe],
  styles: `
    .consolidado { border-collapse: collapse; font-size: 14px; }
    .consolidado th, .consolidado td { border: 1px solid var(--borde); padding: 4px 12px; text-align: center; }
    .consolidado th[scope='row'] { text-align: left; }
  `,
  templateUrl: './criterios.html',
})
export class CriteriosPage {
  protected svc = inject(EvaluacionesService);
  estados = codigos('estado');
  niveles: Nivel[] = ['A', 'AA', 'AAA'];
  filtro = signal<Filtro>('todos');

  resumen = computed(() => consolidado(this.svc.activa() ?? { criterios: {} }));
  respuesta = (fila: number): Criterio => this.svc.activa()?.criterios[fila] ?? criterioVacio();

  /** Criterios visibles, agrupados por principio (P1 a P4). */
  grupos = computed(() => {
    const f = this.filtro();
    const visibles = CATALOGO_ACC.criterios.filter((c) => {
      const e = this.respuesta(c.fila).estado;
      return f === 'todos' || (f === 'pendientes' ? !e : e === 'noCumple');
    });
    const grupos = new Map<string, typeof visibles>();
    for (const c of visibles) grupos.set(c.principio, [...(grupos.get(c.principio) ?? []), c]);
    return [...grupos].map(([principio, criterios]) => ({ principio, criterios }));
  });
  visibles = computed(() => this.grupos().reduce((n, g) => n + g.criterios.length, 0));

  /** "No aplica" exige justificar en observaciones (nota de la hoja 2). */
  private faltaJustificacion = (fila: number) => {
    const r = this.respuesta(fila);
    return r.estado === 'noAplica' && !r.observacion.trim();
  };
  errores = Object.fromEntries(CATALOGO_ACC.criterios.map((c) => [c.fila, errorSi(() => this.faltaJustificacion(c.fila))]));

  estado(fila: number, estado: Criterio['estado']) {
    this.svc.cambiar({ criterios: { [fila]: { estado } } });
  }

  observacion(fila: number, observacion: string) {
    this.svc.cambiar({ criterios: { [fila]: { observacion } } }, `criterio.${fila}`);
  }
}
