import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlmacenService, ResultadoRestauracion } from '../core/almacen.service';
import { AuthService, mensajeError } from '../core/auth.service';
import { descargar } from '../core/progreso';
import { EvaluacionesService } from '../formatos/accesibilidad/evaluaciones.service';
import { FuenteEvidencias } from '../core/evidencias';
import { enfocarInvalido } from '../core/foco';
import { Evidencia, FORMATOS, Formato, Registro, TipoCorte } from '../core/modelos';

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
    else enfocarInvalido();
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
    else enfocarInvalido();
  }
}

// ---------------------------------------------------------- Elegir evidencia
/** Busca una evidencia existente o crea una nueva para asignarla. */
@Component({
  imports: [...BASE, MatAutocompleteModule],
  templateUrl: './elegir-evidencia-dialog.html',
})
export class ElegirEvidenciaDialog {
  d = inject<{ claves: string[]; fuente: FuenteEvidencias }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<ElegirEvidenciaDialog>);
  q = '';
  titulo = '';
  total = computed(() => this.d.fuente.evidencias().length);
  filtradas() {
    const t = (typeof this.q === 'string' ? this.q : '').toLowerCase();
    return this.d.fuente.evidencias()
      .filter((e) => !t || e.titulo.toLowerCase().includes(t) || e.url.toLowerCase().includes(t))
      .slice(0, 40);
  }
  esUrlNueva() {
    return typeof this.q === 'string' && /^https?:\/\/\S+$/i.test(this.q.trim());
  }
  elegir(e: Evidencia) {
    this.d.fuente.asignar(e.id, this.d.claves);
    this.ref.close(e);
  }
  crear() {
    const url = this.q.trim();
    const ev = this.d.fuente.agregar({ url, titulo: this.titulo.trim() || url });
    this.d.fuente.asignar(ev.id, this.d.claves);
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
  d = inject<{ evidencia: Evidencia; usos: string[]; fuente: FuenteEvidencias }>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<AsignarDialog>);
  filtro = signal('');
  seleccion = signal(new Set<string>(this.d.usos));
  private grupos = this.d.fuente.grupos();
  secciones = computed(() => {
    const t = this.filtro().toLowerCase().trim();
    const sel = this.seleccion();
    return this.grupos
      .map((s) => {
        const items = t ? s.items.filter((i) => `${i.texto} ${i.etiqueta} ${s.titulo}`.toLowerCase().includes(t)) : s.items;
        return { ...s, items, marcados: items.filter((i) => sel.has(i.clave)).length };
      })
      .filter((s) => s.items.length);
  });
  alternar(f: string, v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      v ? n.add(f) : n.delete(f);
      return n;
    });
  }
  alternarSeccion(items: { clave: string }[], v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      for (const i of items) v ? n.add(i.clave) : n.delete(i.clave);
      return n;
    });
  }
  guardar() {
    const nuevos = [...this.seleccion()];
    const antes = new Set(this.d.usos);
    const agregar = nuevos.filter((f) => !antes.has(f));
    const quitar = this.d.usos.filter((f) => !this.seleccion().has(f));
    if (agregar.length) this.d.fuente.asignar(this.d.evidencia.id, agregar);
    if (quitar.length) this.d.fuente.quitar(this.d.evidencia.id, quitar);
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

// ---------------------------------------------------------------- Respaldo
/**
 * Respaldo completo (.json) y restauración de cualquier formato. Desde un formato abre con ese
 * formato elegido; desde la vista general, con el primero que el usuario puede ver.
 */
@Component({
  imports: [...BASE, MatRadioModule],
  templateUrl: './respaldo-dialog.html',
})
export class RespaldoDialog {
  private auth = inject(AuthService);
  private t = inject(TranslocoService);
  private acciones: Record<Formato, { archivo: string; respaldo(): Promise<Blob>; restaurar(texto: string): Promise<ResultadoRestauracion> }> = (() => {
    const ita = inject(AlmacenService);
    const acc = inject(EvaluacionesService);
    return {
      ita: { archivo: 'matriz-ita-datos', respaldo: () => ita.respaldoCompleto(), restaurar: (x) => ita.restaurar(x) },
      accesibilidad: { archivo: 'matriz-accesibilidad-datos', respaldo: () => acc.respaldoCompleto(), restaurar: (x) => acc.restaurar(x) },
    };
  })();

  esAdmin = this.auth.esAdmin;
  formatos = FORMATOS.filter((f) => this.auth.puede(f, 'ver'));
  formato = signal<Formato>(this.inicial(inject<{ formato?: Formato } | null>(MAT_DIALOG_DATA)?.formato));
  ocupado = signal(false);
  /** Resultado de la última acción; se anuncia sin mover el foco. */
  mensaje = signal('');

  private inicial(f?: Formato): Formato {
    return f && this.formatos.includes(f) ? f : this.formatos[0]!;
  }

  elegir(f: Formato) {
    this.formato.set(f);
    this.mensaje.set('');
  }

  async descargar() {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const a = this.acciones[this.formato()];
      descargar(await a.respaldo(), `${a.archivo}_${new Date().toISOString().slice(0, 10)}.json`);
      this.mensaje.set(this.t.translate('respaldo.descargado'));
    } catch (e) {
      this.mensaje.set(this.t.translate('app.avisos.errorDescarga', { error: mensajeError(e) }));
    } finally {
      this.ocupado.set(false);
    }
  }

  async restaurar(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f || this.ocupado()) return;
    this.ocupado.set(true);
    try {
      const r = await this.acciones[this.formato()].restaurar(await f.text());
      this.mensaje.set([
        r.creados.length
          ? this.t.translate('registros.restaurado', { nombres: r.creados.map((x) => x.nombre).join(', ') })
          : this.t.translate('respaldo.ningunoCreado'),
        ...r.omitidos.map((x) => this.t.translate('registros.omitido', { nombre: x.nombre, motivo: x.motivo })),
      ].join(' '));
    } catch (e) {
      this.mensaje.set(this.t.translate('app.avisos.errorCarga', { error: mensajeError(e) }));
    } finally {
      this.ocupado.set(false);
    }
  }
}
