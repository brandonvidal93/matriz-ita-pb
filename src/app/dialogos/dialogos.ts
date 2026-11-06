import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AlmacenService } from '../core/almacen.service';
import { SECCIONES, etiquetaCorta } from '../core/catalogo';
import { Evidencia, Registro, TipoCorte } from '../core/modelos';

const BASE = [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, FormsModule];

// ---------------------------------------------------------------- Confirmar
@Component({
  imports: BASE,
  template: `
    <h2 mat-dialog-title>{{ d.titulo }}</h2>
    <mat-dialog-content><p class="preline">{{ d.mensaje }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="true">{{ d.accion || 'Aceptar' }}</button>
    </mat-dialog-actions>
  `,
})
export class ConfirmarDialog {
  d = inject<{ titulo: string; mensaje: string; accion?: string }>(MAT_DIALOG_DATA);
}

// ---------------------------------------------------------------- Registro
export interface DatosRegistro {
  nombre: string;
  tipo: TipoCorte;
  vigencia: number;
  periodo?: string;
  baseId?: string | null;
}

@Component({
  imports: [...BASE, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ d.titulo }}</h2>
    <mat-dialog-content>
      <form id="f-registro" class="flex flex-col gap-1 pt-2 min-w-[min(480px,80vw)]" (ngSubmit)="guardar()">
        <mat-form-field>
          <mat-label>Nombre del corte</mat-label>
          <input matInput name="nombre" [(ngModel)]="m.nombre" required cdkFocusInitial />
          <mat-hint>Ej.: ITA 2027 – Reporte Procuraduría</mat-hint>
        </mat-form-field>
        <div class="flex gap-3 flex-wrap">
          <mat-form-field class="flex-1 min-w-[180px]">
            <mat-label>Tipo</mat-label>
            <mat-select name="tipo" [(ngModel)]="m.tipo">
              <mat-option value="procuraduria">Reporte a la Procuraduría</mat-option>
              <mat-option value="seguimiento">Seguimiento interno</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field class="w-32">
            <mat-label>Vigencia</mat-label>
            <input matInput type="number" name="vigencia" [(ngModel)]="m.vigencia" required />
          </mat-form-field>
          <mat-form-field class="flex-1 min-w-[160px]">
            <mat-label>Periodo (opcional)</mat-label>
            <input matInput name="periodo" [(ngModel)]="m.periodo" placeholder="1.er semestre" />
          </mat-form-field>
        </div>
        @if (d.permitirBase && d.registros.length) {
          <mat-form-field>
            <mat-label>Partir de</mat-label>
            <mat-select name="base" [(ngModel)]="m.baseId">
              <mat-option [value]="null">Matriz en blanco</mat-option>
              @for (r of d.registros; track r.id) {
                <mat-option [value]="r.id">Copia de: {{ r.nombre }}</mat-option>
              }
            </mat-select>
            <mat-hint>Copiar un corte anterior trae respuestas y evidencias para solo actualizarlas.</mat-hint>
          </mat-form-field>
        }
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="f-registro" [disabled]="!m.nombre.trim() || !m.vigencia">Guardar</button>
    </mat-dialog-actions>
  `,
})
export class RegistroDialog {
  d = inject<{ titulo: string; valor?: Partial<DatosRegistro>; permitirBase?: boolean; registros: Registro[] }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<RegistroDialog, DatosRegistro>);
  m: DatosRegistro = {
    nombre: '',
    tipo: 'procuraduria',
    vigencia: new Date().getFullYear(),
    periodo: '',
    baseId: null,
    ...this.d.valor,
  };
  guardar() {
    if (this.m.nombre.trim() && this.m.vigencia) this.ref.close({ ...this.m, nombre: this.m.nombre.trim() });
  }
}

// ---------------------------------------------------------------- Evidencia
@Component({
  imports: BASE,
  template: `
    <h2 mat-dialog-title>{{ d.evidencia ? 'Editar evidencia' : 'Nueva evidencia' }}</h2>
    <mat-dialog-content>
      <form id="f-ev" class="flex flex-col gap-1 pt-2 min-w-[min(520px,80vw)]" (ngSubmit)="guardar()">
        <mat-form-field>
          <mat-label>URL</mat-label>
          <input matInput name="url" type="url" [(ngModel)]="m.url" required placeholder="https://pascualbravo.edu.co/…" (blur)="sugerirTitulo()" />
          @if (m.url && !valida()) { <mat-error>Debe iniciar con http:// o https://</mat-error> }
        </mat-form-field>
        <mat-form-field>
          <mat-label>Título</mat-label>
          <input matInput name="titulo" [(ngModel)]="m.titulo" placeholder="Certificado de accesibilidad 2026" />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Descripción (uso interno)</mat-label>
          <textarea matInput name="desc" rows="2" [(ngModel)]="m.descripcion"></textarea>
        </mat-form-field>
      </form>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancelar</button>
      <button mat-flat-button type="submit" form="f-ev" [disabled]="!valida()">Guardar</button>
    </mat-dialog-actions>
  `,
})
export class EvidenciaDialog {
  d = inject<{ evidencia?: Evidencia }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<EvidenciaDialog>);
  m = { url: '', titulo: '', descripcion: '', ...this.d.evidencia };
  valida = () => /^https?:\/\/\S+$/i.test(this.m.url.trim());
  sugerirTitulo() {
    if (this.m.titulo || !this.valida()) return;
    try {
      const u = new URL(this.m.url.trim());
      const seg = u.pathname.split('/').filter(Boolean).pop();
      this.m.titulo = seg ? decodeURIComponent(seg).replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase()) : u.hostname;
    } catch {}
  }
  guardar() {
    if (this.valida()) this.ref.close({ ...this.m, url: this.m.url.trim(), titulo: this.m.titulo.trim() || this.m.url.trim() });
  }
}

// ---------------------------------------------------------- Elegir evidencia
/** Busca una evidencia existente o crea una nueva para asignarla. */
@Component({
  imports: [...BASE, MatAutocompleteModule],
  template: `
    <h2 mat-dialog-title>Agregar evidencia {{ d.filas.length > 1 ? 'a ' + d.filas.length + ' ítems' : '' }}</h2>
    <mat-dialog-content>
      <div class="min-w-[min(560px,80vw)] pt-2">
        <mat-form-field class="w-full">
          <mat-label>Buscar en la biblioteca o pegar una URL nueva</mat-label>
          <input matInput [(ngModel)]="q" [matAutocomplete]="auto" cdkFocusInitial />
          <mat-autocomplete #auto="matAutocomplete" (optionSelected)="elegir($event.option.value)">
            @for (e of filtradas(); track e.id) {
              <mat-option [value]="e">
                <div class="leading-tight py-1">
                  <div>{{ e.titulo }}</div>
                  <div class="mono texto-suave truncate">{{ e.url }}</div>
                </div>
              </mat-option>
            }
          </mat-autocomplete>
        </mat-form-field>
        @if (esUrlNueva()) {
          <mat-form-field class="w-full">
            <mat-label>Título para la nueva evidencia</mat-label>
            <input matInput [(ngModel)]="titulo" />
          </mat-form-field>
        }
        <p class="texto-suave text-sm">La biblioteca tiene {{ total() }} evidencias. Una misma evidencia puede respaldar varios ítems.</p>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [disabled]="!esUrlNueva()" (click)="crear()">Crear y agregar</button>
    </mat-dialog-actions>
  `,
})
export class ElegirEvidenciaDialog {
  d = inject<{ filas: number[] }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ElegirEvidenciaDialog>);
  private almacen = inject(AlmacenService);
  q = '';
  titulo = '';
  total = computed(() => this.almacen.activo()?.evidencias.length ?? 0);
  filtradas() {
    const t = (typeof this.q === 'string' ? this.q : '').toLowerCase();
    return (this.almacen.activo()?.evidencias ?? [])
      .filter((e) => !t || e.titulo.toLowerCase().includes(t) || e.url.toLowerCase().includes(t))
      .slice(0, 40);
  }
  esUrlNueva() {
    return typeof this.q === 'string' && /^https?:\/\/\S+$/i.test(this.q.trim());
  }
  elegir(e: Evidencia) {
    this.almacen.asignarEvidencia(e.id, this.d.filas);
    this.ref.close(e);
  }
  crear() {
    const url = this.q.trim();
    const ev = this.almacen.agregarEvidencia({ url, titulo: this.titulo.trim() || url });
    this.almacen.asignarEvidencia(ev.id, this.d.filas);
    this.ref.close(ev);
  }
}

// ------------------------------------------------------- Asignar a ítems
@Component({
  imports: [...BASE, MatCheckboxModule],
  styles: `
    .lista { max-height: 55vh; overflow: auto; border: 1px solid var(--borde); border-radius: 8px; }
    summary { cursor: pointer; padding: 8px 12px; background: #f0f3f7; position: sticky; top: 0; z-index: 1; }
  `,
  template: `
    <h2 mat-dialog-title>Asignar evidencia a ítems</h2>
    <mat-dialog-content>
      <div class="min-w-[min(760px,85vw)]">
        <p class="m-0 mb-2"><strong>{{ d.evidencia.titulo }}</strong><br /><span class="mono texto-suave">{{ d.evidencia.url }}</span></p>
        <mat-form-field class="w-full sin-pie">
          <mat-label>Filtrar ítems</mat-label>
          <input matInput [ngModel]="filtro()" (ngModelChange)="filtro.set($event)" placeholder="Ej.: accesibilidad, presupuesto, 4.2" />
        </mat-form-field>
        <p class="text-sm texto-suave my-2">{{ seleccion().size }} ítem(s) seleccionados</p>
        <div class="lista">
          @for (s of secciones(); track s.clave) {
            <details [open]="!!filtro() || s.marcados > 0">
              <summary>
                <mat-checkbox [checked]="s.marcados === s.items.length" [indeterminate]="s.marcados > 0 && s.marcados < s.items.length" (change)="alternarSeccion(s.items, $event.checked)" (click)="$event.stopPropagation()">
                  {{ s.titulo }} <span class="texto-suave">({{ s.marcados }}/{{ s.items.length }})</span>
                </mat-checkbox>
              </summary>
              @for (it of s.items; track it.fila) {
                <div class="px-3 py-1 border-t border-gray-100">
                  <mat-checkbox [checked]="seleccion().has(it.fila)" (change)="alternar(it.fila, $event.checked)">
                    <span class="text-sm">{{ corta(it) }}</span>
                    <span class="texto-suave mono"> · fila {{ it.fila }}</span>
                  </mat-checkbox>
                </div>
              }
            </details>
          }
        </div>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button (click)="guardar()">Aplicar</button>
    </mat-dialog-actions>
  `,
})
export class AsignarDialog {
  d = inject<{ evidencia: Evidencia; usos: number[] }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AsignarDialog>);
  private almacen = inject(AlmacenService);
  filtro = signal('');
  seleccion = signal(new Set<number>(this.d.usos));
  corta = (it: any) => etiquetaCorta(it, 140);
  secciones = computed(() => {
    const t = this.filtro().toLowerCase().trim();
    const sel = this.seleccion();
    return SECCIONES.map((s) => {
      const items = t
        ? s.items.filter((i) => `${i.item} ${i.nivel2} ${s.titulo}`.toLowerCase().includes(t))
        : s.items;
      return { ...s, items, marcados: items.filter((i) => sel.has(i.fila)).length };
    }).filter((s) => s.items.length);
  });
  alternar(f: number, v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      v ? n.add(f) : n.delete(f);
      return n;
    });
  }
  alternarSeccion(items: { fila: number }[], v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      for (const i of items) v ? n.add(i.fila) : n.delete(i.fila);
      return n;
    });
  }
  guardar() {
    const nuevos = [...this.seleccion()];
    const antes = new Set(this.d.usos);
    this.almacen.asignarEvidencia(this.d.evidencia.id, nuevos.filter((f) => !antes.has(f)));
    this.almacen.quitarEvidencia(this.d.evidencia.id, this.d.usos.filter((f) => !this.seleccion().has(f)));
    this.ref.close(true);
  }
}

// ------------------------------------------------------- Texto masivo
@Component({
  imports: BASE,
  template: `
    <h2 mat-dialog-title>Observación para {{ d.filas.length }} ítem(s)</h2>
    <mat-dialog-content>
      <div class="min-w-[min(560px,80vw)] pt-2">
        <mat-form-field class="w-full">
          <mat-label>Observación / justificación</mat-label>
          <textarea matInput rows="5" [(ngModel)]="texto" cdkFocusInitial></textarea>
          <mat-hint>Reemplaza la observación actual de los ítems seleccionados.</mat-hint>
        </mat-form-field>
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="texto">Aplicar</button>
    </mat-dialog-actions>
  `,
})
export class TextoMasivoDialog {
  d = inject<{ filas: number[] }>(MAT_DIALOG_DATA);
  texto = '';
}
