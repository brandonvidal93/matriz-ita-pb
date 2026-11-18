import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe } from '@jsverse/transloco';
import { AlmacenService } from '../../core/almacen.service';
import { EvidenciasItem } from '../../core/evidencias-item';
import { claveProblema, problemas, textoObservacion } from '../../core/catalogo';
import { EstadoCumplimiento, Evidencia, ItemCatalogo, Registro, respuestaVacia } from '../../core/modelos';

@Component({
  selector: 'app-item-card',
  imports: [FormsModule, TextFieldModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, EvidenciasItem, TranslocoPipe],
  styles: `
    :host { display: block; min-width: 0; scroll-margin-top: 140px; }
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
  soloLectura = this.almacen.soloLectura;
  claveProblema = claveProblema;

  resp = computed(() => this.registro().respuestas[this.item().fila] ?? respuestaVacia());
  evidencias = computed(() =>
    this.resp()
      .evidencias.map((id) => this.registro().evidencias.find((e) => e.id === id))
      .filter((e): e is Evidencia => !!e),
  );
  vista = computed(() => textoObservacion(this.resp(), this.registro()));
  probs = computed(() => problemas(this.item(), this.resp()).filter((p) => p !== 'sin-estado'));

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
  }
}
