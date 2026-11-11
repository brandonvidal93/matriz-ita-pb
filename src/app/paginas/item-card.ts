import { Component, ElementRef, Injector, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlmacenService } from '../core/almacen.service';
import { claveProblema, problemas, textoObservacion } from '../core/catalogo';
import { EstadoCumplimiento, Evidencia, ItemCatalogo, Registro, respuestaVacia } from '../core/modelos';

@Component({
  selector: 'app-item-card',
  imports: [FormsModule, TextFieldModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule, TranslocoPipe],
  styles: `
    :host { display: block; min-width: 0; scroll-margin-top: 140px; }
    mat-chip { max-width: 100%; }
    article { border-left: 4px solid transparent; transition: border-color .2s; }
    article.SI { border-left-color: var(--ok); }
    article.NO { border-left-color: var(--no); }
    article.NA { border-left-color: var(--na); }
    article.resaltado { box-shadow: 0 0 0 3px var(--pb-amarillo); }
    details > summary { cursor: pointer; color: var(--texto-suave); font-size: 13px; }
    .vista { background: #f7f9fc; border: 1px dashed var(--borde); border-radius: 8px; padding: 8px 10px; font-size: 13px; }
    mat-button-toggle-group { --mat-standard-button-toggle-height: 36px; }
    .mat-button-toggle-checked.t-SI { background: #e3f4e8; color: var(--ok); }
    .mat-button-toggle-checked.t-NO { background: #fde7e5; color: var(--no); }
    .mat-button-toggle-checked.t-NA { background: #eceff1; color: #37474f; }
  `,
  templateUrl: './item-card.html',
})
export class ItemCard {
  item = input.required<ItemCatalogo>();
  registro = input.required<Registro>();
  seleccionado = input(false);
  resaltado = input(false);
  alternarSeleccion = output<boolean>();
  agregarEvidencia = output<void>();

  private almacen = inject(AlmacenService);
  private injector = inject(Injector);
  private campoNota = viewChild<ElementRef<HTMLElement>>('campoNota');
  private botonEvidencia = viewChild('botonEvidencia', { read: ElementRef });
  soloLectura = this.almacen.soloLectura;
  mostrarNota = false;
  claveProblema = claveProblema;

  resp = computed(() => this.registro().respuestas[this.item().fila] ?? respuestaVacia());
  evidencias = computed(() =>
    this.resp()
      .evidencias.map((id) => this.registro().evidencias.find((e) => e.id === id))
      .filter((e): e is Evidencia => !!e),
  );
  vista = computed(() => textoObservacion(this.resp(), this.registro()));
  probs = computed(() => problemas(this.item(), this.resp()).filter((p) => p !== 'sin-estado'));

  /** El botón desaparece al pulsarlo: el foco pasa al campo que abre. */
  abrirNota() {
    this.mostrarNota = true;
    afterNextRender(() => this.campoNota()?.nativeElement.focus(), { injector: this.injector });
  }
  estado(v: EstadoCumplimiento | null) {
    this.almacen.actualizarRespuesta(this.item().fila, { estado: v });
  }
  texto(v: string) {
    this.almacen.actualizarRespuesta(this.item().fila, { observacion: v });
  }
  nota(v: string) {
    this.almacen.actualizarRespuesta(this.item().fila, { notaInterna: v });
  }
  quitar(e: Evidencia) {
    this.almacen.quitarEvidencia(e.id, [this.item().fila]);
    // El botón de quitar desaparece con su evidencia.
    this.botonEvidencia()?.nativeElement.focus();
  }
}
