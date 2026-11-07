import { UpperCasePipe } from '@angular/common';
import { Component, computed, effect, inject, untracked } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AlmacenService } from './core/almacen.service';
import { AuthService, mensajeError } from './core/auth.service';
import { claveRol } from './core/modelos';
import { IdiomaService } from './core/idioma';
import { descargar } from './core/progreso';
import { CONFIG } from './config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatTooltipModule, TranslocoPipe, UpperCasePipe],
  styles: `
    header { background: var(--pb-azul); color: #fff; }
    .marca { border-left: 4px solid var(--pb-amarillo); padding-left: 12px; color: #fff; text-decoration: none; }
    nav a { color: #dfe7f3; text-decoration: none; padding: 8px 12px; border-radius: 8px; font-weight: 500; }
    nav a:hover { background: rgb(255 255 255 / .08); }
    nav a.activo { background: rgb(255 255 255 / .16); color: #fff; }
    .sync { font-size: 12px; color: #dfe7f3; }
  `,
  template: `
    <a class="saltar" href="#contenido" (click)="saltar($event)">{{ 'app.saltarContenido' | transloco }}</a>
    <header class="sticky top-0 z-20 shadow">
      <div class="max-w-[1400px] mx-auto flex items-center gap-4 px-4 py-2 flex-wrap">
        <a routerLink="/" class="marca no-underline text-white">
          <div class="text-base font-semibold leading-tight">{{ 'app.nombre' | transloco }}</div>
          <div class="text-xs opacity-80 leading-tight">{{ institucion }} · {{ dependencia }}</div>
        </a>
        @if (auth.usuario() && activo(); as r) {
          <nav [attr.aria-label]="'app.nav.etiqueta' | transloco" class="flex gap-1 flex-wrap">
            <a [routerLink]="['/r', r.id]" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">{{ 'app.nav.diligenciar' | transloco }}</a>
            <a [routerLink]="['/r', r.id, 'evidencias']" routerLinkActive="activo">{{ 'app.nav.evidencias' | transloco: { n: r.evidencias.length } }}</a>
            <a [routerLink]="['/r', r.id, 'resumen']" routerLinkActive="activo">{{ 'app.nav.resumen' | transloco }}</a>
          </nav>
          <span class="text-sm opacity-90 truncate max-w-[280px]" [title]="r.nombre">· {{ r.nombre }}</span>
        }
        <span class="flex-1"></span>
        <button mat-button class="!text-white" [matMenuTriggerFor]="menuIdioma" [attr.aria-label]="'app.idioma.cambiar' | transloco" [matTooltip]="'app.idioma.cambiar' | transloco">
          <mat-icon>translate</mat-icon> {{ idioma.actual() | uppercase }}
        </button>
        <mat-menu #menuIdioma="matMenu">
          <div class="px-4 py-2 text-sm texto-suave">{{ 'app.idioma.etiqueta' | transloco }}</div>
          @for (i of idioma.idiomas; track i.codigo) {
            <button mat-menu-item role="menuitemradio" [attr.aria-checked]="i.codigo === idioma.actual()" [attr.lang]="i.locale" (click)="idioma.cambiar(i.codigo)">
              <mat-icon>{{ i.codigo === idioma.actual() ? 'check' : '' }}</mat-icon>{{ i.nombre }}
            </button>
          }
        </mat-menu>
        @if (auth.usuario(); as u) {
          <span class="sync" role="status" aria-live="polite">{{ textoSync() }}</span>
          <button mat-stroked-button class="!text-white !border-white/50" [matMenuTriggerFor]="menuUsuario">
            <mat-icon>account_circle</mat-icon> {{ u.nombre }}
          </button>
          <mat-menu #menuUsuario="matMenu">
            <div class="px-4 py-2 text-sm texto-suave">{{ u.usuario }} · {{ claveRol(u.rol) | transloco }}</div>
            @if (auth.esAdmin()) {
              <a mat-menu-item routerLink="/usuarios"><mat-icon>group</mat-icon>{{ 'app.menu.usuarios' | transloco }}</a>
            }
            <button mat-menu-item (click)="descargarCopia()"><mat-icon>download</mat-icon>{{ 'app.menu.descargarRespaldo' | transloco }}</button>
            @if (auth.esAdmin()) {
              <button mat-menu-item (click)="cargar.click()"><mat-icon>upload</mat-icon>{{ 'app.menu.restaurarRespaldo' | transloco }}</button>
            }
            <button mat-menu-item (click)="salir()"><mat-icon>logout</mat-icon>{{ 'app.menu.salir' | transloco }}</button>
          </mat-menu>
        }
        <input #cargar type="file" accept=".json" hidden (change)="cargarCopia($event)" />
      </div>
    </header>
    <main id="contenido" tabindex="-1" class="outline-none">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected almacen = inject(AlmacenService);
  protected auth = inject(AuthService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  private t = inject(TranslocoService);
  protected idioma = inject(IdiomaService);
  institucion = CONFIG.institucion;
  dependencia = CONFIG.dependencia;

  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: '' });
  activo = computed(() => (this.url().startsWith('/r/') ? this.almacen.activo() : null));

  claveRol = claveRol;

  textoSync = computed(() => {
    this.idioma.actual(); // recalcula al cambiar de idioma
    if (this.almacen.soloLectura()) return this.t.translate('app.sync.soloLectura');
    switch (this.almacen.estadoSync()) {
      case 'pendiente': return this.t.translate('app.sync.pendiente');
      case 'guardando': return this.t.translate('app.sync.guardando');
      case 'error': return this.t.translate('app.sync.error', { error: this.almacen.errorSync() ?? '' });
      default: return this.almacen.ultimoGuardado() ? this.t.translate('app.sync.guardado') : '';
    }
  });

  constructor() {
    // Los errores de guardado también se avisan con un mensaje visible.
    effect(() => {
      const e = this.almacen.errorSync();
      if (e) untracked(() => this.snack.open(this.t.translate('app.avisos.errorGuardado', { error: e }), this.t.translate('comun.cerrar'), { duration: 10000 }));
    });
  }

  async descargarCopia() {
    try {
      descargar(await this.almacen.respaldoCompleto(), `matriz-ita-datos_${new Date().toISOString().slice(0, 10)}.json`);
    } catch (e) {
      this.snack.open(this.t.translate('app.avisos.errorDescarga', { error: mensajeError(e) }), this.t.translate('comun.cerrar'), { duration: 8000 });
    }
  }

  async salir() {
    if (this.almacen.hayPendientes()) await this.almacen.vaciar();
    await this.auth.salir();
    this.almacen.limpiar();
    this.router.navigate(['/ingresar']);
  }

  async cargarCopia(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const r = await this.almacen.restaurar(await f.text());
      const omitidos = r.omitidos.length ? ' ' + this.t.translate('app.avisos.omitidos', { n: r.omitidos.length }) : '';
      this.snack.open(this.t.translate('app.avisos.cargados', { n: r.creados.length }) + omitidos, this.t.translate('comun.cerrar'), { duration: 8000 });
    } catch (e) {
      this.snack.open(this.t.translate('app.avisos.errorCarga', { error: mensajeError(e) }), this.t.translate('comun.cerrar'), { duration: 10000 });
    }
  }

  saltar(ev: Event) {
    ev.preventDefault();
    document.getElementById('contenido')?.focus();
  }
}
