import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { textoObservacion } from '../../core/catalogo';
import { EvidenciasItem } from '../../core/evidencias-item';
import { Evidencia } from '../../core/modelos';
import { problemasCriterio } from './catalogo';
import { EvaluacionesService } from './evaluaciones.service';
import { Criterio, CriterioCatalogo, Evaluacion, codigos, criterioVacio } from './modelo';

/** Clase de color de cada estado, la misma de SI, NO y N/A en ITA. */
export const CLASE_ESTADO = { cumple: 'SI', noCumple: 'NO', noAplica: 'NA' } as const;

/** Tarjeta de un criterio: el mismo diseño que la tarjeta de ítem de ITA. */
@Component({
  selector: 'app-criterio-card',
  imports: [FormsModule, TextFieldModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, EvidenciasItem, TranslocoPipe],
  styles: `:host { display: block; min-width: 0; scroll-margin-top: 140px; }`,
  templateUrl: './criterio-card.html',
})
export class CriterioCard {
  item = input.required<CriterioCatalogo>();
  evaluacion = input.required<Evaluacion>();
  seleccionado = input(false);
  resaltado = input(false);
  alternarSeleccion = output<boolean>();
  agregarEvidencia = output<void>();

  private svc = inject(EvaluacionesService);
  soloLectura = this.svc.soloLectura;
  estados = codigos('estado');
  clase = CLASE_ESTADO;

  resp = computed<Criterio>(() => this.evaluacion().criterios[this.item().fila] ?? criterioVacio());
  evidencias = computed(() =>
    this.resp()
      .evidencias.map((id) => this.evaluacion().evidencias.find((e) => e.id === id))
      .filter((e): e is Evidencia => !!e),
  );
  vista = computed(() => textoObservacion(this.resp(), this.evaluacion()));
  probs = computed(() => problemasCriterio(this.resp()).filter((p) => p !== 'sin-estado'));

  private cambiar(c: Partial<Criterio>, texto?: string) {
    this.svc.cambiar({ criterios: { [this.item().fila]: c } }, texto && `criterio.${this.item().fila}.${texto}`);
  }
  estado(v: Criterio['estado']) {
    this.cambiar({ estado: v });
  }
  texto(v: string) {
    this.cambiar({ observacion: v }, 'observacion');
  }
  nota(v: string) {
    this.cambiar({ notaInterna: v }, 'nota');
  }
  quitar(e: Evidencia) {
    this.svc.quitarEvidencia({ evidencia: e.id, criterios: [this.item().fila] });
  }
}
