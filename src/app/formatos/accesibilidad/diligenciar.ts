import { Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { FUENTE_EVIDENCIAS } from '../../core/evidencias';
import { enfocarTitulo } from '../../core/foco';
import { Lateral } from '../../core/lateral';
import { IDIOMA_PREDETERMINADO, IdiomaService } from '../../core/idioma';
import { ElegirEvidenciaDialog, TextoMasivoDialog } from '../../dialogos/dialogos';
import { CATALOGO_ACC, PRINCIPIOS, consolidado, hallazgosGenerados, planCompleto, problemasCriterio } from './catalogo';
import { CriterioCard } from './criterio-card';
import { EvaluacionesService } from './evaluaciones.service';
import { claveCriterio } from './fuente';
import { SeccionCierre, SeccionGraficos, SeccionHallazgos, SeccionIdentificacion } from './hojas';
import { Criterio, CriterioCatalogo, Evaluacion } from './modelo';

type Filtro = 'todos' | 'pendientes' | 'problemas';

/** Secciones de la barra lateral: las hojas 1, 3 y 4, y la hoja 2 dividida por principio. */
interface Seccion {
  clave: string;
  /** Encabezado del grupo en la barra lateral (vacío: sin encabezado). */
  grupo: string;
  titulo: string;
  /** El título es texto oficial de la matriz (en español). */
  oficial: boolean;
  criterios: CriterioCatalogo[];
}

/**
 * Diligenciar una evaluación de accesibilidad. Misma estructura que la página de ITA:
 * barra lateral con secciones y avance, búsqueda, filtros, selección y acciones masivas.
 */
@Component({
  imports: [FormsModule, Lateral, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatIconModule, MatInputModule, TranslocoPipe,
    CriterioCard, SeccionIdentificacion, SeccionHallazgos, SeccionCierre, SeccionGraficos],
  templateUrl: './diligenciar.html',
})
export class DiligenciarAccPage {
  /** Parámetros de consulta (?seccion=…, ?fila=… o ?hallazgo=…). */
  seccion = input<string>();
  fila = input<string>();
  hallazgo = input<string>();

  protected svc = inject(EvaluacionesService);
  protected idioma = inject(IdiomaService);
  idiomaCatalogo = IDIOMA_PREDETERMINADO;
  private t = inject(TranslocoService);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private injector = inject(Injector);
  private fuente = inject(FUENTE_EVIDENCIAS);
  private botonSeleccionar = viewChild('botonSeleccionar', { read: ElementRef });

  secciones = computed<Seccion[]>(() => {
    this.idioma.actual();
    const criterios = this.t.translate('acc.seccion.criterios');
    return [
      { clave: 'identificacion', grupo: '', titulo: this.t.translate('acc.seccion.identificacion'), oficial: false, criterios: [] },
      ...PRINCIPIOS.map((p) => ({ clave: p.clave, grupo: criterios, titulo: p.titulo, oficial: true, criterios: p.criterios })),
      { clave: 'hallazgos', grupo: '', titulo: this.t.translate('acc.seccion.hallazgos'), oficial: false, criterios: [] },
      { clave: 'cierre', grupo: '', titulo: this.t.translate('acc.seccion.cierre'), oficial: false, criterios: [] },
      { clave: 'graficos', grupo: '', titulo: this.t.translate('acc.seccion.graficos'), oficial: false, criterios: [] },
    ];
  });

  claveSeccion = signal('identificacion');
  busqueda = signal('');
  filtro = signal<Filtro>('todos');
  seleccion = signal(new Set<number>());
  filaResaltada = signal<number | null>(null);
  hallazgoResaltado = signal<string | null>(null);

  seccionActual = computed(() => this.secciones().find((s) => s.clave === this.claveSeccion()) ?? this.secciones()[0]);
  /** Con búsqueda se muestran criterios de toda la matriz. */
  deCriterios = computed(() => !!this.busqueda().trim() || this.seccionActual().criterios.length > 0);

  /** Avance de cada sección para la barra lateral. */
  seccionesConAvance = computed(() => {
    const ev = this.svc.activa()!;
    return this.secciones().map((s) => ({ ...s, p: this.avance(s, ev) }));
  });

  private avance(s: Seccion, ev: Evaluacion): { hechos: number; total: number; porcentaje: number } {
    const p = (hechos: number, total: number) => ({ hechos, total, porcentaje: total ? Math.round((hechos / total) * 100) : 0 });
    if (s.criterios.length || s.clave === 'graficos') {
      const c = s.criterios.length ? consolidado(ev, s.criterios) : consolidado(ev);
      return p(c.evaluados, c.total);
    }
    if (s.clave === 'hallazgos') {
      const hs = hallazgosGenerados(ev);
      return p(hs.filter(planCompleto).length, hs.length);
    }
    const valores = s.clave === 'identificacion' ? Object.values(ev.identificacion) : Object.values(ev.cierre);
    return p(valores.filter((v) => (Array.isArray(v) ? v.length : v)).length, valores.length);
  }

  visibles = computed<CriterioCatalogo[]>(() => {
    const ev = this.svc.activa();
    if (!ev) return [];
    const q = this.busqueda().toLowerCase().trim();
    const base = q
      ? CATALOGO_ACC.criterios.filter((c) =>
          `${c.sc} ${c.criterio} ${c.mintic} ${c.directriz} ${c.descripcion} ${ev.criterios[c.fila]?.observacion ?? ''}`.toLowerCase().includes(q),
        )
      : this.seccionActual().criterios;
    const f = this.filtro();
    if (f === 'todos') return base;
    return base.filter((c) => {
      const p = problemasCriterio(ev.criterios[c.fila]);
      return f === 'pendientes' ? p.includes('sin-estado') : p.some((x) => x !== 'sin-estado');
    });
  });

  constructor() {
    // Con un filtro activo, marcar un criterio puede quitarlo de la lista junto con el control que tenía el foco.
    let primera = true;
    effect(() => {
      this.visibles();
      if (primera) return void (primera = false);
      afterNextRender(() => { if (document.activeElement === document.body) enfocarTitulo({ preventScroll: true }); }, { injector: this.injector });
    });
    effect(() => {
      const s = this.seccion();
      const f = Number(this.fila());
      const h = this.hallazgo();
      untracked(() => {
        if (f) {
          const sec = PRINCIPIOS.find((p) => p.criterios.some((c) => c.fila === f));
          if (sec) this.claveSeccion.set(sec.clave);
          this.filaResaltada.set(f);
          this.irAElemento('fila-' + f);
        } else if (h) {
          this.claveSeccion.set('hallazgos');
          this.hallazgoResaltado.set(h);
          this.irAElemento('hallazgo-' + h);
        } else if (s && this.secciones().some((x) => x.clave === s)) this.claveSeccion.set(s);
      });
    });
  }

  private irAElemento(id: string) {
    setTimeout(() => {
      const el = document.getElementById(id);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      el?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    }, 60);
  }

  irA(s: Seccion) {
    this.busqueda.set('');
    this.claveSeccion.set(s.clave);
    this.filaResaltada.set(null);
    this.hallazgoResaltado.set(null);
    this.router.navigate([], { queryParams: { seccion: s.clave }, replaceUrl: true });
    window.scrollTo({ top: 0 });
  }

  /** La barra de selección desaparece: el foco vuelve al botón que la abre. */
  limpiarSeleccion() {
    this.seleccion.set(new Set());
    this.botonSeleccionar()?.nativeElement.focus();
  }

  alternar(f: number, v: boolean) {
    this.seleccion.update((s) => {
      const n = new Set(s);
      v ? n.add(f) : n.delete(f);
      return n;
    });
  }

  seleccionarVisibles() {
    this.seleccion.set(new Set([...this.seleccion(), ...this.visibles().map((c) => c.fila)]));
  }

  private cambiarVarios(c: Partial<Criterio>) {
    this.svc.cambiar({ criterios: Object.fromEntries([...this.seleccion()].map((f) => [f, c])) });
  }

  marcar(estado: Criterio['estado']) {
    this.cambiarVarios({ estado });
  }

  agregarEvidencia(filas: number[]) {
    this.dialog.open(ElegirEvidenciaDialog, { data: { claves: filas.map(claveCriterio), fuente: this.fuente } });
  }

  async observacionMasiva() {
    const filas = [...this.seleccion()];
    const t = await firstValueFrom(this.dialog.open(TextoMasivoDialog, { data: { filas } }).afterClosed());
    if (typeof t === 'string') this.cambiarVarios({ observacion: t });
  }
}
