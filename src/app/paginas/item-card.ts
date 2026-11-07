import { Component, computed, inject, input, output } from '@angular/core';
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
import { AlmacenService } from '../core/almacen.service';
import { TEXTO_PROBLEMA, problemas, textoObservacion } from '../core/catalogo';
import { EstadoCumplimiento, Evidencia, ItemCatalogo, Registro, respuestaVacia } from '../core/modelos';

@Component({
  selector: 'app-item-card',
  imports: [FormsModule, TextFieldModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatChipsModule, MatFormFieldModule, MatIconModule, MatInputModule, MatTooltipModule],
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
  template: `
    @let r = resp();
    <article class="tarjeta p-4" [class]="r.estado ?? ''" [class.resaltado]="resaltado()" [attr.aria-labelledby]="'it-' + item().fila">
      <div class="flex gap-3 items-start flex-wrap">
        @if (!soloLectura()) {
        <mat-checkbox class="-mt-2 -ml-2" [checked]="seleccionado()" (change)="alternarSeleccion.emit($event.checked)" [aria-label]="'Seleccionar ítem fila ' + item().fila" />
        }
        <div class="flex-1 min-w-0">
          @if (item().nivel2) { <div class="text-xs uppercase tracking-wide texto-suave font-semibold">{{ item().nivel2 }}</div> }
          <h3 [id]="'it-' + item().fila" class="text-[15px] font-medium leading-snug m-0 mt-1">{{ item().item }}</h3>
          <details class="mt-1">
            <summary>Qué se pide y normatividad · fila {{ item().fila }}</summary>
            <p class="text-sm my-2 preline">{{ item().explicacion }}</p>
            <p class="text-xs texto-suave m-0"><strong>Normatividad:</strong> {{ item().normatividad }}</p>
          </details>
        </div>
        @if (item().tipo === 'cumplimiento') {
          <mat-button-toggle-group [value]="r.estado" [disabled]="soloLectura()" (change)="estado($event.value)" [attr.aria-label]="'Cumplimiento del ítem fila ' + item().fila" hideSingleSelectionIndicator>
            <mat-button-toggle value="SI" class="t-SI">SI</mat-button-toggle>
            <mat-button-toggle value="NO" class="t-NO">NO</mat-button-toggle>
            <mat-button-toggle value="NA" class="t-NA">N/A</mat-button-toggle>
          </mat-button-toggle-group>
        }
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-[1fr_minmax(260px,38%)]">
        <div>
          <mat-form-field class="w-full sin-pie">
            <mat-label>{{ item().tipo === 'numero' ? 'Valor a reportar' : r.estado === 'NA' ? 'Justificación jurídica del N/A' : 'Observación / justificación' }}</mat-label>
            <textarea matInput rows="2" cdkTextareaAutosize [readonly]="soloLectura()" [ngModel]="r.observacion" (ngModelChange)="texto($event)"></textarea>
          </mat-form-field>
          <div class="mt-2 flex flex-wrap gap-2 items-center">
            <mat-chip-set [attr.aria-label]="'Evidencias del ítem fila ' + item().fila">
              @for (e of evidencias(); track e.id) {
                <mat-chip (removed)="quitar(e)" [matTooltip]="e.url" [removable]="!soloLectura()">
                  <mat-icon matChipAvatar>link</mat-icon>{{ e.titulo }}
                  @if (!soloLectura()) {
                    <button matChipRemove [attr.aria-label]="'Quitar evidencia ' + e.titulo"><mat-icon>cancel</mat-icon></button>
                  }
                </mat-chip>
              }
            </mat-chip-set>
            @if (!soloLectura()) {
              <button mat-stroked-button (click)="agregarEvidencia.emit()"><mat-icon>add_link</mat-icon>Evidencia</button>
            }
            @if (!soloLectura() && !mostrarNota && !r.notaInterna) {
              <button mat-button (click)="mostrarNota = true"><mat-icon>sticky_note_2</mat-icon>Nota interna</button>
            }
          </div>
          @if (mostrarNota || r.notaInterna) {
            <mat-form-field class="w-full sin-pie mt-2">
              <mat-label>Nota interna (no se exporta)</mat-label>
              <textarea matInput rows="1" cdkTextareaAutosize [readonly]="soloLectura()" [ngModel]="r.notaInterna" (ngModelChange)="nota($event)"></textarea>
            </mat-form-field>
          }
        </div>
        <div>
          <div class="text-xs font-semibold texto-suave mb-1">Así quedará en la columna I</div>
          <div class="vista preline break-words">{{ vista() || '—' }}</div>
          @for (p of probs(); track p) {
            <div class="chip-estado pendiente mt-2"><mat-icon class="!w-4 !h-4 !text-base">warning</mat-icon>{{ textoProblema[p] }}</div>
          }
        </div>
      </div>
    </article>
  `,
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
  mostrarNota = false;
  textoProblema = TEXTO_PROBLEMA;

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
