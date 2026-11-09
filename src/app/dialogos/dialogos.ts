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
import { TranslocoPipe } from '@jsverse/transloco';
import { AlmacenService } from '../core/almacen.service';
import { SECCIONES, etiquetaCorta } from '../core/catalogo';
import { Evidencia, Registro, TipoCorte } from '../core/modelos';

const BASE = [MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatIconModule, FormsModule, TranslocoPipe];

// ---------------------------------------------------------------- Confirmar
@Component({
  imports: BASE,
  templateUrl: './confirmar-dialog.html',
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
  templateUrl: './registro-dialog.html',
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
  templateUrl: './evidencia-dialog.html',
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
  templateUrl: './elegir-evidencia-dialog.html',
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
  templateUrl: './asignar-dialog.html',
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
  templateUrl: './texto-masivo-dialog.html',
})
export class TextoMasivoDialog {
  d = inject<{ filas: number[] }>(MAT_DIALOG_DATA);
  texto = '';
}
