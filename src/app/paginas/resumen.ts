import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatRadioModule } from '@angular/material/radio';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlmacenService } from '../core/almacen.service';
import { SECCIONES, claveProblema, etiquetaCorta, problemas } from '../core/catalogo';
import { descargar, nombreArchivo, progreso } from '../core/progreso';
import { XlsxService } from '../core/xlsx.service';

@Component({
  imports: [FormsModule, RouterLink, MatButtonModule, MatIconModule, MatRadioModule, TranslocoPipe],
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
        <h1 class="text-2xl font-semibold m-0">{{ 'resumen.titulo' | transloco }}</h1>

        <section class="grid gap-3 grid-cols-2 md:grid-cols-5" [attr.aria-label]="'resumen.indicadores' | transloco">
          <div class="tarjeta p-4"><div class="cifra">{{ p.porcentaje }}%</div><div class="texto-suave text-sm">{{ 'resumen.diligenciados' | transloco: { n: p.diligenciados, total: p.total } }}</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--ok)">{{ p.si }}</div><div class="texto-suave text-sm">{{ 'resumen.cumple' | transloco }}</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--no)">{{ p.no }}</div><div class="texto-suave text-sm">{{ 'resumen.noCumple' | transloco }}</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: var(--na)">{{ p.na }}</div><div class="texto-suave text-sm">{{ 'resumen.noAplica' | transloco }}</div></div>
          <div class="tarjeta p-4"><div class="cifra" style="color: #7a5a00">{{ p.conProblemas }}</div><div class="texto-suave text-sm">{{ 'resumen.porRevisar' | transloco }}</div></div>
        </section>

        <section class="tarjeta p-4" aria-labelledby="t-exp">
          <h2 id="t-exp" class="text-lg font-semibold m-0 mb-1">{{ 'resumen.exportar.titulo' | transloco }}</h2>
          <p class="texto-suave text-sm mt-0">
            {{ 'resumen.exportar.descripcion' | transloco }}
          </p>
          <div class="flex flex-wrap gap-6 items-center my-3">
            <mat-radio-group [ngModel]="reg.formatoEvidencias" [disabled]="almacen.soloLectura()" (ngModelChange)="almacen.renombrar(reg.id, { formatoEvidencias: $event })" [attr.aria-label]="'resumen.exportar.formatoEtiqueta' | transloco">
              <span class="text-sm mr-2">{{ 'resumen.exportar.formato' | transloco }}</span>
              <mat-radio-button value="url">{{ 'resumen.exportar.soloUrl' | transloco }}</mat-radio-button>
              <mat-radio-button value="titulo-url">{{ 'resumen.exportar.tituloUrl' | transloco }}</mat-radio-button>
            </mat-radio-group>
          </div>
          @if (p.conProblemas) {
            <p class="chip-estado pendiente !rounded-lg !py-2 !px-3 !font-normal">
              <mat-icon class="!w-5 !h-5 !text-xl">warning</mat-icon>
              {{ 'resumen.exportar.aviso' | transloco: { n: p.conProblemas } }}
            </p>
          }
          <button mat-flat-button (click)="exportar()" [disabled]="exportando()">
            <mat-icon>download</mat-icon>{{ (exportando() ? 'resumen.exportar.generando' : 'resumen.exportar.descargar') | transloco }}
          </button>
        </section>

        <section class="tarjeta p-4 overflow-x-auto" aria-labelledby="t-sec">
          <h2 id="t-sec" class="text-lg font-semibold m-0 mb-2">{{ 'resumen.avance' | transloco }}</h2>
          <table>
            <thead><tr><th scope="col">{{ 'resumen.col.seccion' | transloco }}</th><th scope="col" class="text-right">{{ 'resumen.col.items' | transloco }}</th><th scope="col" class="text-right">{{ 'estado.SI' | transloco }}</th><th scope="col" class="text-right">{{ 'estado.NO' | transloco }}</th><th scope="col" class="text-right">{{ 'estado.NA' | transloco }}</th><th scope="col" class="text-right">{{ 'resumen.col.porRevisar' | transloco }}</th><th scope="col">{{ 'resumen.col.avance' | transloco }}</th></tr></thead>
            <tbody>
              @for (s of porSeccion(); track s.clave) {
                <tr>
                  <td><a [routerLink]="['/r', reg.id]" [queryParams]="{ seccion: s.clave }" lang="es">{{ s.titulo }}</a></td>
                  <td class="n">{{ s.p.total }}</td><td class="n">{{ s.p.si }}</td><td class="n">{{ s.p.no }}</td><td class="n">{{ s.p.na }}</td><td class="n">{{ s.p.conProblemas }}</td>
                  <td class="min-w-[140px]"><div class="barra-progreso"><span [style.width.%]="s.p.porcentaje"></span></div></td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        @if (pendientes().length) {
          <section class="tarjeta p-4" aria-labelledby="t-pend">
            <h2 id="t-pend" class="text-lg font-semibold m-0 mb-2">{{ 'resumen.pendientes' | transloco: { n: pendientes().length } }}</h2>
            <ul class="m-0 pl-5 grid gap-1 text-sm">
              @for (x of pendientes().slice(0, limite()); track x.fila) {
                <li>
                  <a [routerLink]="['/r', reg.id]" [queryParams]="{ fila: x.fila }" lang="es">{{ x.texto }}</a>
                  <span class="texto-suave"> — @for (k of x.motivos; track k) {<span>{{ k | transloco }}{{ $last ? '' : ', ' }}</span>}</span>
                </li>
              }
            </ul>
            @if (pendientes().length > limite()) {
              <button mat-button class="mt-2" (click)="limite.set(limite() + 50)">{{ 'comun.verMas' | transloco }}</button>
            }
          </section>
        }
      </div>
    }
  `,
})
export class ResumenPage {
  protected almacen = inject(AlmacenService);
  private xlsx = inject(XlsxService);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  exportando = signal(false);
  limite = signal(50);

  total = computed(() => progreso(this.almacen.activo()!));
  porSeccion = computed(() => SECCIONES.map((s) => ({ ...s, p: progreso(this.almacen.activo()!, s.items) })));
  pendientes = computed(() => {
    const reg = this.almacen.activo()!;
    return SECCIONES.flatMap((s) =>
      s.items
        .map((it) => ({ it, p: problemas(it, reg.respuestas[it.fila]) }))
        .filter((x) => x.p.length)
        .map((x) => ({ fila: x.it.fila, texto: `${s.titulo.slice(0, 45)} › ${etiquetaCorta(x.it, 100)}`, motivos: x.p.map(claveProblema) })),
    );
  });

  async exportar() {
    const reg = this.almacen.activo()!;
    this.exportando.set(true);
    try {
      const blob = await this.xlsx.exportar(reg);
      const nombre = nombreArchivo(reg, 'xlsx');
      descargar(blob, nombre);
    } catch (e: any) {
      this.snack.open(this.t.translate('resumen.exportar.error', { error: e?.message ?? e }), this.t.translate('comun.cerrar'), { duration: 10000 });
    } finally {
      this.exportando.set(false);
    }
  }
}
