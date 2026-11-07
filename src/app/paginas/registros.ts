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
import { descargar, nombreArchivo, progreso } from '../core/progreso';
import { AvisoImportacion, XlsxService } from '../core/xlsx.service';
import { ConfirmarDialog, DatosRegistro, RegistroDialog } from '../dialogos/dialogos';

@Component({
  imports: [FechaPipe, MatButtonModule, MatIconModule, MatMenuModule, MatProgressBarModule, TranslocoPipe],
  template: `
    <div class="max-w-[1100px] mx-auto px-4 py-6">
      <div class="flex items-end gap-3 flex-wrap mb-2">
        <div class="flex-1 min-w-[260px]">
          <h1 class="text-2xl font-semibold m-0">{{ 'registros.titulo' | transloco }}</h1>
          <p class="texto-suave m-0 mt-1">
            {{ 'registros.descripcion' | transloco: { version, total: totalItems } }}
          </p>
        </div>
        @if (!almacen.soloLectura()) {
          <button mat-stroked-button (click)="archivoXlsx.click()"><mat-icon>upload_file</mat-icon>{{ 'registros.importarXlsx' | transloco }}</button>
          @if (auth.esAdmin()) {
            <button mat-stroked-button (click)="archivoJson.click()"><mat-icon>settings_backup_restore</mat-icon>{{ 'registros.restaurarRespaldo' | transloco }}</button>
          }
          <button mat-flat-button (click)="nuevo()"><mat-icon>add</mat-icon>{{ 'registros.nuevo' | transloco }}</button>
        }
        <input #archivoXlsx type="file" accept=".xlsx" hidden (change)="importarXlsx($event)" />
        <input #archivoJson type="file" accept=".json" hidden (change)="restaurar($event)" />
      </div>

      @if (importando()) { <mat-progress-bar mode="indeterminate" class="my-3" /> }

      @if (advertencias().length) {
        <section class="tarjeta p-4 my-4 border-amber-300 bg-amber-50" aria-labelledby="t-adv">
          <div class="flex items-center gap-2">
            <h2 id="t-adv" class="text-base font-semibold m-0 flex-1">{{ 'registros.resultadoImportacion' | transloco }}</h2>
            <button mat-icon-button [attr.aria-label]="'registros.cerrarAviso' | transloco" (click)="advertencias.set([])"><mat-icon>close</mat-icon></button>
          </div>
          <ul class="m-0 pl-5 text-sm max-h-60 overflow-auto">
            @for (a of advertencias(); track $index) { <li>{{ a.clave | transloco: a.params }}</li> }
          </ul>
        </section>
      }

      @if (cargando()) { <mat-progress-bar mode="indeterminate" class="my-3" /> }
      @if (error()) {
        <p class="tarjeta p-4 mt-4" role="alert">{{ 'registros.errorCarga' | transloco: { error: error() } }} <button mat-button (click)="recargar()">{{ 'comun.reintentar' | transloco }}</button></p>
      }

      @if (almacen.cargado() && !almacen.registros().length) {
        <section class="tarjeta p-8 mt-6 text-center">
          <mat-icon class="!w-12 !h-12 !text-5xl texto-suave">fact_check</mat-icon>
          <h2 class="text-lg font-semibold mt-2">{{ 'registros.vacio.titulo' | transloco }}</h2>
          <p class="texto-suave max-w-[560px] mx-auto">
            {{ (almacen.soloLectura() ? 'registros.vacio.lector' : 'registros.vacio.editor') | transloco }}
          </p>
        </section>
      }

      <ul class="list-none p-0 grid gap-3 mt-4" [attr.aria-label]="'registros.lista' | transloco">
        @for (r of almacen.registros(); track r.id) {
          @let p = prog(r);
          <li class="tarjeta p-4 flex gap-4 items-center flex-wrap">
            <div class="flex-1 min-w-[260px]">
              <div class="flex items-center gap-2 flex-wrap">
                <h2 class="text-lg font-semibold m-0">
                  <a class="no-underline text-inherit hover:underline" href="" (click)="abrir(r, $event)">{{ r.nombre }}</a>
                </h2>
                <span class="chip-estado" [class.SI]="r.tipo === 'procuraduria'" [class.NA]="r.tipo !== 'procuraduria'">
                  {{ (r.tipo === 'procuraduria' ? 'registros.tipo.procuraduria' : 'registros.tipo.seguimiento') | transloco }}
                </span>
              </div>
              <div class="texto-suave text-sm mt-1">
                {{ 'registros.vigencia' | transloco: { v: r.vigencia } }}{{ r.periodo ? ' · ' + r.periodo : '' }} ·
                {{ 'registros.nEvidencias' | transloco: { n: r.evidencias.length } }} ·
                {{ 'registros.actualizado' | transloco: { fecha: (r.actualizado | fecha: 'd MMM y, h:mm a') } }}
              </div>
              <div class="flex items-center gap-3 mt-2">
                <div class="barra-progreso flex-1 max-w-[360px]" role="progressbar" [attr.aria-valuenow]="p.porcentaje" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="'registros.avance' | transloco: { n: p.porcentaje }">
                  <span [style.width.%]="p.porcentaje"></span>
                </div>
                <span class="text-sm">{{ p.diligenciados }}/{{ p.total }} ({{ p.porcentaje }}%)</span>
                <span class="chip-estado SI">{{ 'estado.SI' | transloco }} {{ p.si }}</span>
                <span class="chip-estado NO">{{ 'estado.NO' | transloco }} {{ p.no }}</span>
                <span class="chip-estado NA">{{ 'estado.NA' | transloco }} {{ p.na }}</span>
              </div>
            </div>
            <button mat-flat-button (click)="abrir(r)">{{ 'registros.abrir' | transloco }}</button>
            <button mat-icon-button [matMenuTriggerFor]="m" [attr.aria-label]="'comun.masAcciones' | transloco: { nombre: r.nombre }"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              @if (!almacen.soloLectura()) {
                <button mat-menu-item (click)="editar(r)"><mat-icon>edit</mat-icon>{{ 'registros.menu.editar' | transloco }}</button>
                <button mat-menu-item (click)="duplicar(r)"><mat-icon>content_copy</mat-icon>{{ 'registros.menu.duplicar' | transloco }}</button>
              }
              <button mat-menu-item (click)="respaldo(r)"><mat-icon>download</mat-icon>{{ 'registros.menu.respaldo' | transloco }}</button>
              @if (auth.esAdmin()) {
                <button mat-menu-item (click)="eliminar(r)"><mat-icon>delete</mat-icon>{{ 'comun.eliminar' | transloco }}</button>
              }
            </mat-menu>
          </li>
        }
      </ul>
    </div>
  `,
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
    this.snack.open(this.t.translate(clave, { error: mensajeError(e) }), this.t.translate('comun.cerrar'), { duration: 8000 });
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
      this.snack.open(partes.join(' '), this.t.translate('comun.cerrar'), { duration: 10000 });
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
