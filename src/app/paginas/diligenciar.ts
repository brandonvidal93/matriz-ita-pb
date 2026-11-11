import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
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
import { enfocarTitulo } from '../core/foco';
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
    .lateral button:focus-visible { outline: 3px solid var(--foco); }
    .grupo { font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: var(--texto-suave); margin: 14px 10px 4px; font-weight: 700; }
    .acciones { position: sticky; bottom: 12px; z-index: 10; background: var(--pb-azul); color: #fff; --foco: var(--pb-amarillo); }
  `,
  templateUrl: './diligenciar.html',
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
  private injector = inject(Injector);
  private botonSeleccionar = viewChild('botonSeleccionar', { read: ElementRef });
  /** La barra de selección desaparece: el foco vuelve al botón que la abre. */
  limpiarSeleccion() {
    this.seleccion.set(new Set());
    this.botonSeleccionar()?.nativeElement.focus();
  }

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
    // Con un filtro activo, marcar un ítem puede quitarlo de la lista junto con el control que tenía el foco.
    let primera = true;
    effect(() => {
      this.visibles();
      if (primera) { primera = false; return; }
      afterNextRender(() => { if (document.activeElement === document.body) enfocarTitulo({ preventScroll: true }); }, { injector: this.injector });
    });
    effect(() => {
      const s = this.seccion();
      const f = Number(this.fila());
      untracked(() => {
        if (f) {
          const sec = SECCIONES.find((x) => x.items.some((i) => i.fila === f));
          if (sec) this.claveSeccion.set(sec.clave);
          this.filaResaltada.set(f);
          setTimeout(() => {
            const tarjeta = document.getElementById('fila-' + f);
            tarjeta?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            tarjeta?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
          }, 60);
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
