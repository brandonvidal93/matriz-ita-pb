import { Component, inject, signal } from '@angular/core';
import { FechaPipe } from '../core/idioma';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AlmacenService } from '../core/almacen.service';
import { AuthService, mensajeError } from '../core/auth.service';
import { CATALOGO } from '../core/catalogo';
import { Registro } from '../core/modelos';
import { enfocarTitulo } from '../core/foco';
import { descargar, nombreArchivo, progreso } from '../core/progreso';
import { AvisoImportacion, XlsxService } from '../core/xlsx.service';
import { ConfirmarDialog, DatosRegistro, RegistroDialog } from '../dialogos/dialogos';

@Component({
  imports: [FechaPipe, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, TranslocoPipe],
  templateUrl: './registros.html',
})
export class RegistrosPage {
  protected almacen = inject(AlmacenService);
  protected auth = inject(AuthService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private xlsx = inject(XlsxService);
  private t = inject(TranslocoService);

  version = CATALOGO.version;
  totalItems = CATALOGO.items.length;
  importando = signal(false);
  advertencias = signal<AvisoImportacion[]>([]);
  prog = (r: Registro) => progreso(r);
  cargando = signal(false);
  error = signal<string | null>(null);

  constructor() {
    this.recargar();
  }

  /** Siempre se muestra la versión más reciente del servidor. */
  async recargar() {
    this.cargando.set(true);
    this.error.set(null);
    try {
      await this.almacen.cargar();
    } catch (e) {
      this.error.set(mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  /** `clave` es una de `registros.error.*`. */
  private fallo(clave: string, e: unknown) {
    this.snack.open(this.t.translate(clave, { error: mensajeError(e) }), this.t.translate('comun.cerrar'));
  }

  cerrarAdvertencias() {
    this.advertencias.set([]);
    enfocarTitulo();
  }

  abrir(r: Registro, ev?: Event) {
    ev?.preventDefault();
    this.router.navigate(['/r', r.id]);
  }

  private async pedirDatos(titulo: string, valor?: Partial<DatosRegistro>, permitirBase = false) {
    const ref = this.dialog.open(RegistroDialog, { data: { titulo, valor, permitirBase, registros: this.almacen.registros() } });
    return firstValueFrom(ref.afterClosed()) as Promise<DatosRegistro | undefined>;
  }

  async nuevo() {
    const año = new Date().getFullYear();
    const d = await this.pedirDatos(
      this.t.translate('registros.dialogo.nuevo'),
      { nombre: this.t.translate('registros.dialogo.nombreDefecto', { anio: año }), vigencia: año },
      true,
    );
    if (!d) return;
    try {
      const reg = await this.almacen.crear(datosDe(d), d.baseId ? { baseId: d.baseId } : {});
      this.router.navigate(['/r', reg.id]);
    } catch (e) {
      this.fallo('registros.error.crear', e);
    }
  }

  async duplicar(r: Registro) {
    const d = await this.pedirDatos(this.t.translate('registros.dialogo.duplicar', { nombre: r.nombre }), {
      nombre: this.t.translate('registros.dialogo.copia', { nombre: r.nombre }),
      tipo: r.tipo,
      vigencia: r.vigencia,
      periodo: r.periodo,
    });
    if (!d) return;
    try {
      await this.almacen.crear(datosDe(d), { baseId: r.id });
    } catch (e) {
      this.fallo('registros.error.crearCorte', e);
    }
  }

  async editar(r: Registro) {
    const d = await this.pedirDatos(this.t.translate('registros.dialogo.editar'), { nombre: r.nombre, tipo: r.tipo, vigencia: r.vigencia, periodo: r.periodo });
    if (d) this.almacen.renombrar(r.id, { nombre: d.nombre, tipo: d.tipo, vigencia: d.vigencia, periodo: d.periodo });
  }

  async eliminar(r: Registro) {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmarDialog, {
          data: {
            titulo: this.t.translate('registros.eliminar.titulo'),
            mensaje: this.t.translate('registros.eliminar.mensaje', { nombre: r.nombre }),
            accion: this.t.translate('comun.eliminar'),
          },
        })
        .afterClosed(),
    );
    if (!ok) return;
    try {
      await this.almacen.eliminar(r.id);
      enfocarTitulo(); // El menú desde el que se eliminó ya no existe.
    } catch (e) {
      this.fallo('registros.error.eliminar', e);
    }
  }

  respaldo(r: Registro) {
    descargar(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }), nombreArchivo(r, 'json'));
  }

  async restaurar(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const r = await this.almacen.restaurar(await f.text());
      const partes = [
        r.creados.length
          ? this.t.translate('registros.restaurado', { nombres: r.creados.map((x) => x.nombre).join(', ') })
          : this.t.translate('registros.ningunoCreado'),
        ...r.omitidos.map((x) => this.t.translate('registros.omitido', { nombre: x.nombre, motivo: x.motivo })),
      ];
      this.snack.open(partes.join(' '), this.t.translate('comun.cerrar'));
    } catch (e) {
      this.fallo('registros.error.restaurar', e);
    }
  }

  async importarXlsx(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.importando.set(true);
    try {
      const res = await this.xlsx.importar(f);
      const año = new Date().getFullYear();
      const d = await this.pedirDatos(this.t.translate('registros.dialogo.importar', { archivo: f.name }), {
        nombre: this.t.translate('registros.dialogo.nombreImportado', { archivo: f.name.replace(/\.xlsx$/i, '') }),
        vigencia: año,
      });
      if (!d) return;
      await this.almacen.crear(datosDe(d), { contenido: { respuestas: res.respuestas, evidencias: res.evidencias } });
      this.advertencias.set([
        { clave: 'registros.leidos', params: { items: res.itemsLeidos, evidencias: res.evidencias.length } },
        ...res.advertencias,
      ]);
    } catch (e) {
      this.fallo('registros.error.importar', e);
    } finally {
      this.importando.set(false);
    }
  }
}

/** Solo los datos del registro (sin el id de base del diálogo). */
function datosDe(d: DatosRegistro) {
  return { nombre: d.nombre, tipo: d.tipo, vigencia: d.vigencia, periodo: d.periodo ?? undefined };
}
