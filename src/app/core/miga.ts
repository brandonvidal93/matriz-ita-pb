import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { filter, map } from 'rxjs';
import { EvaluacionesService } from '../formatos/accesibilidad/evaluaciones.service';
import { AlmacenService } from './almacen.service';
import { IdiomaService } from './idioma';

export interface Miga {
  texto: string;
  ruta: string;
}

/**
 * Miga de pan (WCAG 2.4.8). Cada ruta que debe aparecer declara `data: { miga: 'clave.i18n' }`;
 * `'@registro'` muestra el nombre del registro abierto. Siempre empieza en Inicio.
 */
@Component({
  selector: 'app-miga',
  imports: [RouterLink, MatIconModule, TranslocoPipe],
  styles: `
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; font-size: 13px; }
    li { display: inline-flex; align-items: center; gap: 4px; min-width: 0; overflow-wrap: anywhere; }
    mat-icon { width: 16px; height: 16px; font-size: 16px; color: var(--texto-suave); }
    [aria-current] { color: var(--texto-suave); }
  `,
  templateUrl: './miga.html',
})
export class MigaPan {
  private router = inject(Router);
  private t = inject(TranslocoService);
  private idioma = inject(IdiomaService);
  private almacen = inject(AlmacenService);
  private evaluaciones = inject(EvaluacionesService);
  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: '' });

  private nombreRegistro(): string {
    if (this.url().startsWith('/accesibilidad')) {
      const e = this.evaluaciones.activa();
      return e ? this.t.translate('acc.ticket', { n: e.ticket }) + (e.identificacion.requerimiento ? ` · ${e.identificacion.requerimiento}` : '') : '';
    }
    return this.almacen.activo()?.nombre ?? '';
  }

  migas = computed<Miga[]>(() => {
    this.url();
    this.idioma.actual(); // se recalcula al cambiar de idioma
    const out: Miga[] = [{ texto: this.t.translate('titulos.panel'), ruta: '/' }];
    const partes: string[] = [];
    for (let s = this.router.routerState.snapshot.root.firstChild; s; s = s.firstChild) {
      partes.push(...s.url.map((u) => u.path));
      const clave = s.routeConfig?.data?.['miga'];
      if (clave) out.push({ texto: clave === '@registro' ? this.nombreRegistro() : this.t.translate(clave), ruta: '/' + partes.join('/') });
    }
    return out;
  });
}
