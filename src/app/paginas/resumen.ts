import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AlmacenService } from '../core/almacen.service';
import { DriveService } from '../core/drive.service';
import { SECCIONES, TEXTO_PROBLEMA, etiquetaCorta, problemas } from '../core/catalogo';
import { descargar, nombreArchivo, progreso } from '../core/progreso';
import { XlsxService } from '../core/xlsx.service';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatCheckboxModule, MatIconModule, MatRadioModule],
  styles: `
    .cifra { font-size: 28px; font-weight: 700; line-height: 1.1; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th, td { padding: 8px 10px; border-bottom: 1px solid #edf0f4; text-align: left; }
    th { font-size: 12px; color: var(--texto-suave); text-transform: uppercase; }
    td.n { text-align: right; font-variant-numeric: tabular-nums; }
  `,
  template: `
    @if (almacen.activo(); as reg) {
      @let p = total();
      <div class="max-w-[1200px] mx-auto px-4 py-5 grid gap-4">
        <h1 class="text-2xl font-semibold m-0">Revisar y exportar</h1>

        <section class="grid gap-3 grid-cols-2 md:grid-cols-5" aria-label="Indicadores">
          <div class="tarjeta p-4"><div class="cifra">{{ p.porcentaje }}%</div><div class="texto-suave text-sm">{{ p.diligenciados }} de {{ p.total }} diligenciados</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--ok)">{{ p.si }}</div><div class="texto-suave text-sm">Cumple (SI)</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--no)">{{ p.no }}</div><div class="texto-suave text-sm">No cumple (NO)</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--na)">{{ p.na }}</div><div class="texto-suave text-sm">No aplica (N/A)</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: #7a5a00">{{ p.conProblemas }}</div><div class="texto-suave text-sm">Ítems por revisar</div></div>
        </section>

        <section class="tarjeta p-4" aria-labelledby="t-exp">
          <h2 id="t-exp" class="text-lg font-semibold m-0 mb-1">Generar archivo oficial</h2>
          <p class="texto-suave text-sm mt-0">
            Se llena la plantilla oficial de la Procuraduría (Matriz ITA 2023) marcando SI/NO/N/A con “X” y escribiendo la
            observación y las URLs en la columna I. Estructura, estilos e instrucciones no se modifican.
          </p>
          <div class="flex flex-wrap gap-6 items-center my-3">
            <mat-radio-group [ngModel]="reg.formatoEvidencias" (ngModelChange)="almacen.renombrar(reg.id, { formatoEvidencias: $event })" aria-label="Formato de evidencias">
              <span class="text-sm mr-2">Evidencias en columna I:</span>
              <mat-radio-button value="url">Solo URL</mat-radio-button>
              <mat-radio-button value="titulo-url">Título: URL</mat-radio-button>
            </mat-radio-group>
            @if (drive.conectado()) {
              <mat-checkbox [(ngModel)]="copiaDrive">Guardar también una copia en Drive</mat-checkbox>
            }
          </div>
          @if (p.conProblemas) {
            <p class="chip-estado pendiente !rounded-lg !py-2 !px-3 !font-normal">
              <mat-icon class="!w-5 !h-5 !text-xl">warning</mat-icon>
              Hay {{ p.conProblemas }} ítems sin diligenciar o con soporte incompleto. Puedes exportar igual, pero conviene revisarlos.
            </p>
          }
          <button mat-flat-button (click)="exportar()" [disabled]="exportando()">
            <mat-icon>download</mat-icon>{{ exportando() ? 'Generando…' : 'Descargar matriz diligenciada (.xlsx)' }}
          </button>
        </section>

        <section class="tarjeta p-4 overflow-x-auto" aria-labelledby="t-sec">
          <h2 id="t-sec" class="text-lg font-semibold m-0 mb-2">Avance por sección</h2>
          <table>
            <thead><tr><th scope="col">Sección</th><th scope="col" class="text-right">Ítems</th><th scope="col" class="text-right">SI</th><th scope="col" class="text-right">NO</th><th scope="col" class="text-right">N/A</th><th scope="col" class="text-right">Por revisar</th><th scope="col">Avance</th></tr></thead>
            <tbody>
              @for (s of porSeccion(); track s.clave) {
                <tr>
                  <td><a [routerLink]="['/r', reg.id]" [queryParams]="{ seccion: s.clave }">{{ s.titulo }}</a></td>
                  <td class="n">{{ s.p.total }}</td><td class="n">{{ s.p.si }}</td><td class="n">{{ s.p.no }}</td><td class="n">{{ s.p.na }}</td><td class="n">{{ s.p.conProblemas }}</td>
                  <td class="min-w-[140px]"><div class="barra-progreso"><span [style.width.%]="s.p.porcentaje"></span></div></td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        @if (pendientes().length) {
          <section class="tarjeta p-4" aria-labelledby="t-pend">
            <h2 id="t-pend" class="text-lg font-semibold m-0 mb-2">Ítems por revisar ({{ pendientes().length }})</h2>
            <ul class="m-0 pl-5 grid gap-1 text-sm">
              @for (x of pendientes().slice(0, limite()); track x.fila) {
                <li>
                  <a [routerLink]="['/r', reg.id]" [queryParams]="{ fila: x.fila }">{{ x.texto }}</a>
                  <span class="texto-suave"> — {{ x.motivo }}</span>
                </li>
              }
            </ul>
            @if (pendientes().length > limite()) {
              <button mat-button class="mt-2" (click)="limite.set(limite() + 50)">Ver más</button>
            }
          </section>
        }
      </div>
    }
  `,
})
export class ResumenPage {
  protected almacen = inject(AlmacenService);
  protected drive = inject(DriveService);
  private xlsx = inject(XlsxService);
  private snack = inject(MatSnackBar);
  exportando = signal(false);
  limite = signal(50);
  copiaDrive = true;

  total = computed(() => progreso(this.almacen.activo()!));
  porSeccion = computed(() => SECCIONES.map((s) => ({ ...s, p: progreso(this.almacen.activo()!, s.items) })));
  pendientes = computed(() => {
    const reg = this.almacen.activo()!;
    return SECCIONES.flatMap((s) =>
      s.items
        .map((it) => ({ it, p: problemas(it, reg.respuestas[it.fila]) }))
        .filter((x) => x.p.length)
        .map((x) => ({ fila: x.it.fila, texto: `${s.titulo.slice(0, 45)} › ${etiquetaCorta(x.it, 100)}`, motivo: x.p.map((k) => TEXTO_PROBLEMA[k]).join(', ') })),
    );
  });

  async exportar() {
    const reg = this.almacen.activo()!;
    this.exportando.set(true);
    try {
      const blob = await this.xlsx.exportar(reg);
      const nombre = nombreArchivo(reg, 'xlsx');
      descargar(blob, nombre);
      if (this.drive.conectado() && this.copiaDrive) {
        await this.drive.guardarExportacion(nombre, blob);
        this.snack.open('Archivo descargado y copia guardada en Drive.', undefined, { duration: 4000 });
      }
    } catch (e: any) {
      this.snack.open('No se pudo generar el archivo: ' + (e?.message ?? e), 'Cerrar', { duration: 10000 });
    } finally {
      this.exportando.set(false);
    }
  }
}
