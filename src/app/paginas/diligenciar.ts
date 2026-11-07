import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AlmacenService } from '../core/almacen.service';
import { SECCIONES, Seccion, problemas } from '../core/catalogo';
import { EstadoCumplimiento, ItemCatalogo } from '../core/modelos';
import { IDIOMA_PREDETERMINADO, IdiomaService } from '../core/idioma';
import { progreso } from '../core/progreso';
import { ElegirEvidenciaDialog, TextoMasivoDialog } from '../dialogos/dialogos';
import { ItemCard } from './item-card';

type Filtro = 'todos' | 'pendientes' | 'problemas';

@Component({
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule, MatMenuModule, ItemCard, TranslocoPipe],
  styles: `
    .lateral { max-height: 40vh; overflow: auto; }
    @media (min-width: 1024px) { .lateral { position: sticky; top: 72px; max-height: calc(100vh - 88px); } }
    .lateral button { all: unset; display: block; width: 100%; box-sizing: border-box; cursor: pointer; padding: 8px 10px; border-radius: 8px; }
    .lateral button:hover { background: #eef2f7; }
    .lateral button[aria-current='true'] { background: #dde7f5; font-weight: 600; }
    .lateral button:focus-visible { outline: 3px solid var(--pb-amarillo); }
    .grupo { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--texto-suave); margin: 14px 10px 4px; font-weight: 700; }
    .acciones { position: sticky; bottom: 12px; z-index: 10; background: var(--pb-azul); color: #fff; }
  `,
  template: `
    @if (almacen.activo(); as reg) {
      <div class="max-w-[1400px] mx-auto px-4 py-4 grid gap-4 grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside class="lateral tarjeta p-2 min-w-0" [attr.aria-label]="'diligenciar.secciones' | transloco">
          @for (s of seccionesConAvance(); track s.clave; let i = $index) {
            @if (i === 0 || s.grupo !== seccionesConAvance()[i - 1].grupo) { <div class="grupo" lang="es">{{ s.grupo }}</div> }
            <button [attr.aria-current]="s.clave === seccionActual().clave && !busqueda()" (click)="irA(s)">
              <div class="text-sm leading-snug" lang="es">{{ s.titulo }}</div>
              <div class="flex items-center gap-2 mt-1">
                <div class="barra-progreso flex-1"><span [style.width.%]="s.p.porcentaje"></span></div>
                <span class="text-xs texto-suave">{{ s.p.diligenciados }}/{{ s.p.total }}</span>
              </div>
            </button>
          }
        </aside>

        <section aria-labelledby="t-seccion" class="min-w-0">
          <div class="flex gap-3 items-center flex-wrap mb-3">
            <h1 id="t-seccion" class="text-xl font-semibold m-0 flex-1 min-w-[240px]">
              @if (busqueda()) { {{ 'diligenciar.resultados' | transloco: { q: busqueda() } }} } @else { <span lang="es">{{ seccionActual().titulo }}</span> }
            </h1>
            <mat-form-field class="sin-pie w-full sm:w-[280px]" subscriptSizing="dynamic">
              <mat-icon matPrefix>search</mat-icon>
              <mat-label>{{ 'diligenciar.buscar' | transloco }}</mat-label>
              <input matInput [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" />
            </mat-form-field>
            <mat-button-toggle-group [value]="filtro()" (change)="filtro.set($event.value)" [attr.aria-label]="'diligenciar.filtrar' | transloco" hideSingleSelectionIndicator>
              <mat-button-toggle value="todos">{{ 'diligenciar.filtro.todos' | transloco }}</mat-button-toggle>
              <mat-button-toggle value="pendientes">{{ 'diligenciar.filtro.pendientes' | transloco }}</mat-button-toggle>
              <mat-button-toggle value="problemas">{{ 'diligenciar.filtro.problemas' | transloco }}</mat-button-toggle>
            </mat-button-toggle-group>
          </div>

          @if (idioma.actual() !== idiomaCatalogo) {
            <p class="text-xs texto-suave mt-0 mb-3 flex items-center gap-1"><mat-icon class="!w-4 !h-4 !text-base">info</mat-icon>{{ 'comun.textoOficial' | transloco }}</p>
          }

          @if (!almacen.soloLectura()) {
          <div class="flex items-center gap-2 mb-3 text-sm">
            <button mat-button (click)="seleccionarVisibles()"><mat-icon>select_all</mat-icon>{{ 'diligenciar.seleccionarVisibles' | transloco: { n: visibles().length } }}</button>
            @if (seleccion().size) { <button mat-button (click)="limpiarSeleccion()">{{ 'diligenciar.quitarSeleccion' | transloco }}</button> }
          </div>
          }

          @if (!visibles().length) {
            <p class="tarjeta p-6 texto-suave">{{ 'diligenciar.sinItems' | transloco }}</p>
          }
          <div class="grid gap-3 grid-cols-1">
            @for (it of visibles(); track it.fila) {
              <app-item-card
                [id]="'fila-' + it.fila"
                [item]="it"
                [registro]="reg"
                [seleccionado]="seleccion().has(it.fila)"
                [resaltado]="filaResaltada() === it.fila"
                (alternarSeleccion)="alternar(it.fila, $event)"
                (agregarEvidencia)="agregarEvidencia([it.fila])" />
            }
          </div>

          @if (seleccion().size && !almacen.soloLectura()) {
            <div class="acciones mt-4 rounded-xl shadow-lg px-4 py-2 flex items-center gap-2 flex-wrap" role="region" [attr.aria-label]="'diligenciar.accionesSeleccion' | transloco">
              <strong class="mr-2">{{ 'diligenciar.seleccionados' | transloco: { n: seleccion().size } }}</strong>
              <button mat-button class="!text-white" (click)="marcar('SI')">{{ 'diligenciar.marcarSi' | transloco }}</button>
              <button mat-button class="!text-white" (click)="marcar('NO')">{{ 'estado.NO' | transloco }}</button>
              <button mat-button class="!text-white" (click)="marcar('NA')">{{ 'estado.NA' | transloco }}</button>
              <button mat-button class="!text-white" (click)="agregarEvidencia([...seleccion()])"><mat-icon>add_link</mat-icon>{{ 'diligenciar.asignarEvidencia' | transloco }}</button>
              <button mat-button class="!text-white" (click)="observacionMasiva()"><mat-icon>notes</mat-icon>{{ 'diligenciar.observacion' | transloco }}</button>
              <span class="flex-1"></span>
              <button mat-icon-button class="!text-white" [attr.aria-label]="'diligenciar.cerrarSeleccion' | transloco" (click)="limpiarSeleccion()"><mat-icon>close</mat-icon></button>
            </div>
          }
        </section>
      </div>
    }
  `,
})
export class DiligenciarPage {
  /** Parámetros de consulta (?seccion=…&fila=…). */
  seccion = input<string>();
  fila = input<string>();

  protected almacen = inject(AlmacenService);
  protected idioma = inject(IdiomaService);
  /** El catálogo oficial siempre está en español. */
  idiomaCatalogo = IDIOMA_PREDETERMINADO;
  private dialog = inject(MatDialog);
  private router = inject(Router);
  limpiarSeleccion() { this.seleccion.set(new Set()); }

  claveSeccion = signal(SECCIONES[0].clave);
  busqueda = signal('');
  filtro = signal<Filtro>('todos');
  seleccion = signal(new Set<number>());
  filaResaltada = signal<number | null>(null);

  seccionActual = computed(() => SECCIONES.find((s) => s.clave === this.claveSeccion()) ?? SECCIONES[0]);

  seccionesConAvance = computed(() => {
    const reg = this.almacen.activo()!;
    return SECCIONES.map((s) => ({ ...s, p: progreso(reg, s.items) }));
  });

  visibles = computed<ItemCatalogo[]>(() => {
    const reg = this.almacen.activo();
    if (!reg) return [];
    const q = this.busqueda().toLowerCase().trim();
    const base = q
      ? SECCIONES.flatMap((s) => s.items).filter((i) =>
          `${i.item} ${i.nivel1} ${i.nivel2} ${i.explicacion} ${reg.respuestas[i.fila]?.observacion ?? ''}`.toLowerCase().includes(q),
        )
      : this.seccionActual().items;
    const f = this.filtro();
    if (f === 'todos') return base;
    return base.filter((i) => {
      const p = problemas(i, reg.respuestas[i.fila]);
      return f === 'pendientes' ? p.includes('sin-estado') : p.length > 0;
    });
  });

  constructor() {
    effect(() => {
      const s = this.seccion();
      const f = Number(this.fila());
      untracked(() => {
        if (f) {
          const sec = SECCIONES.find((x) => x.items.some((i) => i.fila === f));
          if (sec) this.claveSeccion.set(sec.clave);
          this.filaResaltada.set(f);
          setTimeout(() => document.getElementById('fila-' + f)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        } else if (s && SECCIONES.some((x) => x.clave === s)) this.claveSeccion.set(s);
      });
    });
  }

  irA(s: Seccion) {
    this.busqueda.set('');
    this.claveSeccion.set(s.clave);
    this.filaResaltada.set(null);
    this.router.navigate([], { queryParams: { seccion: s.clave }, replaceUrl: true });
    window.scrollTo({ top: 0 });
  }

  alternar(f: number, v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      v ? n.add(f) : n.delete(f);
      return n;
    });
  }

  seleccionarVisibles() {
    this.seleccion.set(new Set([...this.seleccion(), ...this.visibles().map((i) => i.fila)]));
  }

  marcar(e: EstadoCumplimiento) {
    const filas = [...this.seleccion()].filter((f) => SECCIONES.flatMap((s) => s.items).find((i) => i.fila === f)?.tipo === 'cumplimiento');
    this.almacen.actualizarVarias(filas, { estado: e });
  }

  agregarEvidencia(filas: number[]) {
    this.dialog.open(ElegirEvidenciaDialog, { data: { filas } });
  }

  async observacionMasiva() {
    const filas = [...this.seleccion()];
    const t = await firstValueFrom(this.dialog.open(TextoMasivoDialog, { data: { filas } }).afterClosed());
    if (typeof t === 'string') this.almacen.actualizarVarias(filas, { observacion: t });
  }
}
