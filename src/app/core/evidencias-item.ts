import { Component, ElementRef, Injector, afterNextRender, inject, input, output, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TextFieldModule } from '@angular/cdk/text-field';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe } from '@jsverse/transloco';
import { Evidencia } from './modelos';

/** Evidencias (chips) y nota interna de un elemento. Es el mismo bloque en todos los formatos. */
@Component({
  selector: 'app-evidencias-item',
  imports: [FormsModule, TextFieldModule, MatButtonModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule, TranslocoPipe],
  styles: `
    :host { display: block; }
    mat-chip { max-width: 100%; }
  `,
  templateUrl: './evidencias-item.html',
})
export class EvidenciasItem {
  evidencias = input.required<Evidencia[]>();
  nota = input<string | undefined>('');
  /** Ubicación para los nombres accesibles, p. ej. "ítem fila 14" o "criterio SC1.1.1". */
  ubicacion = input.required<string>();
  soloLectura = input(false);
  agregar = output<void>();
  quitar = output<Evidencia>();
  cambiarNota = output<string>();

  private injector = inject(Injector);
  private campoNota = viewChild<ElementRef<HTMLElement>>('campoNota');
  private botonEvidencia = viewChild('botonEvidencia', { read: ElementRef });
  mostrarNota = signal(false);

  /** El botón desaparece al pulsarlo: el foco pasa al campo que abre. */
  abrirNota() {
    this.mostrarNota.set(true);
    afterNextRender(() => this.campoNota()?.nativeElement.focus(), { injector: this.injector });
  }

  quitarEvidencia(e: Evidencia) {
    this.quitar.emit(e);
    // El botón de quitar desaparece con su evidencia.
    this.botonEvidencia()?.nativeElement.focus();
  }
}
