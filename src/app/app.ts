import { UpperCasePipe } from '@angular/common';
import { Component, Injector, afterNextRender, computed, effect, inject, signal, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet, TitleStrategy } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlmacenService } from './core/almacen.service';
import { AuthService } from './core/auth.service';
import { FORMATOS, claveRol } from './core/modelos';
import { IdiomaService } from './core/idioma';
import { enfocarTitulo } from './core/foco';
import { Esqueleto } from './core/esqueleto';
import { MigaPan } from './core/miga';
import { MatDialog } from '@angular/material/dialog';
import { RespaldoDialog } from './dialogos/dialogos';
import { CONFIG } from './config';
import { AVISO_ERROR } from './core/avisos';
import { EvaluacionesService } from './formatos/accesibilidad/evaluaciones.service';

@Component({
  selector: 'app-root',
  imports: [Esqueleto, MigaPan, RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatTooltipModule, TranslocoPipe, UpperCasePipe],
  styles: `
    header { background: var(--pb-azul); color: #fff; --foco: var(--pb-amarillo); }
    .marca { border-left: 4px solid var(--pb-amarillo); padding-left: 12px; color: #fff; text-decoration: none; }
    nav a { color: #dfe7f3; text-decoration: none; padding: 8px 12px; border-radius: 8px; font-weight: 500; }
    nav a:hover { background: rgb(255 255 255 / .08); }
    nav a.activo { background: rgb(255 255 255 / .16); color: #fff; text-decoration: underline; text-underline-offset: 4px; text-decoration-thickness: 2px; }
    /* Indicador flotante: no recibe clics (pointer-events) y es pequeño, así que nunca tapa por completo un control (2.4.11). */
    .sync {
      position: fixed; right: 16px; bottom: 16px; z-index: 30; pointer-events: none;
      display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 999px;
      background: var(--pb-azul); color: #fff; font-size: 13px; box-shadow: 0 2px 8px rgb(0 0 0 / .25);
    }
    /* Vacío, sin display:none: una región oculta deja de anunciarse en algunos lectores. */
    .sync.vacio { padding: 0; box-shadow: none; }
    .sync mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .sync mat-icon.error { color: #ffb4ab; }
    /* El error completo va en el aviso rojo; aquí se corta para no crecer sobre el contenido. */
    .texto-sync { max-width: 22em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    footer { border-top: 1px solid var(--borde); margin-top: 24px; }
  `,
  templateUrl: './app.html',
})
export class App {
  protected almacen = inject(AlmacenService);
  protected evaluaciones = inject(EvaluacionesService);
  protected auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  private router = inject(Router);
  private injector = inject(Injector);
  private titulos = inject(TitleStrategy);
  private t = inject(TranslocoService);
  protected idioma = inject(IdiomaService);
  institucion = CONFIG.institucion;
  dependencia = CONFIG.dependencia;

  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: '' });
  /**
   * Menú del registro abierto. Todos los formatos tienen las mismas tres páginas:
   * `#/<formato>/r/:id` (diligenciar), `…/evidencias` y `…/resumen`.
   */
  activo = computed(() => {
    const m = this.menuRegistro();
    return m && { ...m, evidenciasRuta: [...m.base, 'evidencias'], resumenRuta: [...m.base, 'resumen'] };
  });
  private menuRegistro = computed(() => {
    const u = this.url();
    if (u.startsWith('/ita/r/')) {
      const r = this.almacen.activo();
      return r && { base: ['/ita/r', r.id], nombre: r.nombre, evidencias: r.evidencias.length };
    }
    if (u.startsWith('/accesibilidad/r/')) {
      const e = this.evaluaciones.activa();
      const nombre = this.t.translate('acc.ticket', { n: e?.ticket });
      return e && { base: ['/accesibilidad/r', e.id], nombre: e.identificacion.requerimiento ? `${nombre} · ${e.identificacion.requerimiento}` : nombre, evidencias: e.evidencias.length };
    }
    return null;
  });

  claveRol = claveRol;
  /** La página anterior se oculta solo si la navegación (guardias, carga diferida) tarda; así no parpadea. */
  navegandoLento = signal(false);

  /** Estado de guardado del formato que se está viendo. */
  private escritura = computed(() => (this.url().startsWith('/accesibilidad') ? this.evaluaciones : this.almacen));

  textoSync = computed(() => {
    this.idioma.actual(); // recalcula al cambiar de idioma
    const s = this.escritura();
    if (s.soloLectura()) return this.t.translate('app.sync.soloLectura');
    switch (s.estadoSync()) {
      case 'pendiente': return this.t.translate('app.sync.pendiente');
      case 'guardando': return this.t.translate('app.sync.guardando');
      case 'error': return this.t.translate('app.sync.error', { error: s.errorSync() ?? '' });
      default: return s.ultimoGuardado() ? this.t.translate('app.sync.guardado') : '';
    }
  });

  /** Ícono del estado de guardado; acompaña al texto, que en móvil queda solo para lectores de pantalla. */
  iconoSync = computed(() => {
    const s = this.escritura();
    if (s.soloLectura()) return 'visibility';
    return { pendiente: 'pending', guardando: 'sync', error: 'cloud_off', guardado: 'cloud_done' }[s.estadoSync()];
  });

  constructor() {
    effect((alLimpiar) => {
      if (!this.router.currentNavigation()) return this.navegandoLento.set(false);
      const t = setTimeout(() => this.navegandoLento.set(true), 300);
      alLimpiar(() => clearTimeout(t));
    });
    // Al cambiar de página, el foco va al título nuevo: el elemento pulsado ya no existe. Con ?fila= lo pone Diligenciar.
    let rutaAnterior = '';
    effect(() => {
      const url = this.url();
      const ruta = url.split('?')[0];
      if (rutaAnterior && ruta !== rutaAnterior && !url.includes('fila=')) afterNextRender(() => enfocarTitulo(), { injector: this.injector });
      if (url) rutaAnterior = ruta;
    });
    // IdiomaService pone el título general; aquí se reemplaza por el de la página, ya traducido.
    effect(() => {
      this.idioma.actual();
      untracked(() => this.titulos.updateTitle(this.router.routerState.snapshot));
    });
    // Los errores de guardado también se avisan con un mensaje visible.
    for (const s of [this.almacen, this.evaluaciones])
      effect(() => {
        const e = s.errorSync();
        if (e) untracked(() => this.snack.open(this.t.translate('app.avisos.errorGuardado', { error: e }), this.t.translate('comun.cerrar'), AVISO_ERROR));
      });
  }

  /** Abre el respaldo con el formato en el que está el usuario (en la vista general, el primero que puede ver). */
  respaldo() {
    const formato = FORMATOS.find((f) => this.url().startsWith(`/${f}`));
    this.dialog.open(RespaldoDialog, { data: { formato }, autoFocus: 'first-tabbable' });
  }
  protected puedeRespaldo = computed(() => FORMATOS.some((f) => this.auth.puede(f, 'ver')));

  async salir() {
    await Promise.all([this.almacen.vaciar(), this.evaluaciones.vaciar()]);
    await this.auth.salir();
    this.almacen.limpiar();
    this.evaluaciones.limpiar();
    this.router.navigate(['/ingresar']);
  }

  saltar(ev: Event) {
    ev.preventDefault();
    document.getElementById('contenido')?.focus();
  }
}
