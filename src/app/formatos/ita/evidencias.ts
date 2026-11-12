import { Component, computed, inject, signal } from '@angular/core';
import { FechaPipe } from '../../core/idioma';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AlmacenService } from '../../core/almacen.service';
import { ITEM_POR_FILA, etiquetaCorta } from '../../core/catalogo';
import { Evidencia } from '../../core/modelos';
import { enfocarTitulo } from '../../core/foco';
import { verificarUrl } from '../../core/progreso';
import { AsignarDialog, ConfirmarDialog, EvidenciaDialog } from '../../dialogos/dialogos';

@Component({
  imports: [FechaPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatMenuModule, MatProgressBarModule, MatTooltipModule, TranslocoPipe],
  styles: `
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--texto-suave); padding: 10px 12px; border-bottom: 1px solid var(--borde); background: #f7f9fc; }
    td { padding: 10px 12px; border-bottom: 1px solid #edf0f4; vertical-align: top; }
    tr.abierta td { background: #fbfcfe; }
  `,
  templateUrl: './evidencias.html',
})
export class EvidenciasPage {
  protected almacen = inject(AlmacenService);
  private dialog = inject(MatDialog);
  private t = inject(TranslocoService);
  q = signal('');
  abierta = signal<string | null>(null);
  verificando = signal(false);
  avance = signal(0);
  corta = (f: number) => {
    const it = ITEM_POR_FILA.get(f);
    return it ? `${it.nivel1 ? it.nivel1.slice(0, 40) + ' › ' : ''}${etiquetaCorta(it, 110)}` : this.t.translate('evidencias.fila', { fila: f });
  };

  lista = computed(() => {
    const t = this.q().toLowerCase().trim();
    const evs = this.almacen.activo()?.evidencias ?? [];
    return t ? evs.filter((e) => `${e.titulo} ${e.url} ${e.descripcion ?? ''}`.toLowerCase().includes(t)) : evs;
  });

  async nueva() {
    const d = await firstValueFrom(this.dialog.open(EvidenciaDialog, { data: {} }).afterClosed());
    if (d) {
      const ev = this.almacen.agregarEvidencia(d);
      this.asignar(ev, this.almacen.usos(ev.id));
    }
  }

  async editar(e: Evidencia) {
    const d = await firstValueFrom(this.dialog.open(EvidenciaDialog, { data: { evidencia: e } }).afterClosed());
    if (d) this.almacen.editarEvidencia(e.id, { titulo: d.titulo, url: d.url, descripcion: d.descripcion, verificacion: d.url !== e.url ? undefined : e.verificacion });
  }

  asignar(e: Evidencia, usos: number[]) {
    this.dialog.open(AsignarDialog, { data: { evidencia: e, usos }, maxWidth: '95vw' });
  }

  async eliminar(e: Evidencia, n: number) {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmarDialog, {
          data: {
            titulo: this.t.translate('evidencias.eliminar.titulo'),
            mensaje: this.t.translate('evidencias.eliminar.mensaje', { titulo: e.titulo, n }),
            accion: this.t.translate('comun.eliminar'),
          },
        })
        .afterClosed(),
    );
    if (ok) {
      this.almacen.eliminarEvidencia(e.id);
      enfocarTitulo(); // El menú desde el que se eliminó ya no existe.
    }
  }

  async verificar(e: Evidencia) {
    const estado = await verificarUrl(e.url);
    this.almacen.editarEvidencia(e.id, { verificacion: { fecha: new Date().toISOString(), estado } });
  }

  async verificarTodas() {
    if (this.verificando()) return;
    const evs = this.almacen.activo()?.evidencias ?? [];
    this.verificando.set(true);
    let hechas = 0;
    const cola = [...evs];
    const trabajador = async () => {
      while (cola.length) {
        const e = cola.shift()!;
        await this.verificar(e);
        this.avance.set(Math.round((++hechas / evs.length) * 100));
      }
    };
    await Promise.all(Array.from({ length: 5 }, trabajador));
    this.verificando.set(false);
  }
}
