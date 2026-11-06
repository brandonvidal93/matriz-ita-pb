import { Component, computed, inject } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AlmacenService } from './core/almacen.service';
import { descargar } from './core/progreso';
import { CONFIG } from './config';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatButtonModule, MatIconModule, MatMenuModule, MatSnackBarModule, MatTooltipModule],
  styles: `
    header { background: var(--pb-azul); color: #fff; }
    .marca { border-left: 4px solid var(--pb-amarillo); padding-left: 12px; color: #fff; text-decoration: none; }
    nav a { color: #dfe7f3; text-decoration: none; padding: 8px 12px; border-radius: 8px; font-weight: 500; }
    nav a:hover { background: rgb(255 255 255 / .08); }
    nav a.activo { background: rgb(255 255 255 / .16); color: #fff; }
    .sync { font-size: 12px; color: #dfe7f3; }
  `,
  template: `
    <a class="saltar" href="#contenido" (click)="saltar($event)">Saltar al contenido</a>
    <header class="sticky top-0 z-20 shadow">
      <div class="max-w-[1400px] mx-auto flex items-center gap-4 px-4 py-2 flex-wrap">
        <a routerLink="/" class="marca no-underline text-white">
          <div class="text-base font-semibold leading-tight">Matriz ITA</div>
          <div class="text-xs opacity-80 leading-tight">{{ institucion }} · {{ dependencia }}</div>
        </a>
        @if (activo(); as r) {
          <nav aria-label="Secciones del registro" class="flex gap-1 flex-wrap">
            <a [routerLink]="['/r', r.id]" routerLinkActive="activo" [routerLinkActiveOptions]="{ exact: true }">Diligenciar</a>
            <a [routerLink]="['/r', r.id, 'evidencias']" routerLinkActive="activo">Evidencias ({{ r.evidencias.length }})</a>
            <a [routerLink]="['/r', r.id, 'resumen']" routerLinkActive="activo">Revisar y exportar</a>
          </nav>
          <span class="text-sm opacity-90 truncate max-w-[280px]" [title]="r.nombre">· {{ r.nombre }}</span>
        }
        <span class="flex-1"></span>
        <span class="sync" role="status" aria-live="polite">{{ textoSync() }}</span>
        @switch (almacen.archivo.estado()) {
          @case ('vinculado') {
            <button mat-stroked-button class="!text-white !border-white/50" [matMenuTriggerFor]="menuArchivo" [matTooltip]="'Los cambios se guardan automáticamente en ' + almacen.archivo.nombre()">
              <mat-icon>save</mat-icon> {{ almacen.archivo.nombre() }}
            </button>
          }
          @case ('requiere-permiso') {
            <button mat-flat-button class="!bg-[var(--pb-amarillo)] !text-black" (click)="accion(almacen.reconectarArchivo(), 'Archivo reconectado.')"
              [matTooltip]="'El navegador pide confirmar el acceso a ' + almacen.archivo.nombre()">
              <mat-icon>lock_open</mat-icon> Reconectar {{ almacen.archivo.nombre() }}
            </button>
          }
          @default {
            <button mat-stroked-button class="!text-white !border-white/50" [matMenuTriggerFor]="menuArchivo">
              <mat-icon>folder_open</mat-icon> Archivo de datos
            </button>
          }
        }
        <mat-menu #menuArchivo="matMenu">
          @if (almacen.archivo.soportado) {
            <button mat-menu-item (click)="accion(almacen.abrirArchivo(), 'Archivo abierto. Los cambios se guardarán en él.')"><mat-icon>file_open</mat-icon>Abrir archivo de datos…</button>
            <button mat-menu-item (click)="accion(almacen.crearArchivo(), 'Archivo creado. Los cambios se guardarán en él.')"><mat-icon>note_add</mat-icon>Crear archivo de datos nuevo…</button>
            @if (almacen.archivo.estado() === 'vinculado') {
              <button mat-menu-item (click)="accion(almacen.guardarArchivo(), 'Guardado.')"><mat-icon>save</mat-icon>Guardar ahora</button>
              <button mat-menu-item (click)="almacen.desvincularArchivo()"><mat-icon>link_off</mat-icon>Dejar de usar este archivo</button>
            }
          }
          <button mat-menu-item (click)="descargarCopia()"><mat-icon>download</mat-icon>Descargar copia (.json)</button>
          <button mat-menu-item (click)="cargar.click()"><mat-icon>upload</mat-icon>Cargar copia (.json)…</button>
        </mat-menu>
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
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  institucion = CONFIG.institucion;
  dependencia = CONFIG.dependencia;

  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: '' });
  activo = computed(() => (this.url().startsWith('/r/') ? this.almacen.activo() : null));

  textoSync = computed(() => {
    const est = this.almacen.archivo.estado();
    if (est === 'requiere-permiso') return 'Archivo sin confirmar · cambios solo en el navegador';
    if (est === 'sin-archivo') return this.almacen.archivo.soportado ? 'Sin archivo · cambios solo en el navegador' : 'Guardado en este navegador';
    switch (this.almacen.estadoSync()) {
      case 'pendiente': return 'Cambios por guardar…';
      case 'guardando': return 'Guardando…';
      case 'error': return 'Error al guardar: ' + (this.almacen.errorSync() ?? '');
      default: return 'Guardado en el archivo';
    }
  });

  async accion(p: Promise<unknown>, ok: string) {
    try {
      await p;
      this.snack.open(ok, undefined, { duration: 3500 });
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // el usuario cerró el selector
      this.snack.open('No se pudo completar: ' + (e?.message ?? e), 'Cerrar', { duration: 8000 });
    }
  }

  descargarCopia() {
    descargar(this.almacen.copiaJson(), `matriz-ita-datos_${new Date().toISOString().slice(0, 10)}.json`);
  }

  async cargarCopia(ev: Event) {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    try {
      const n = this.almacen.cargarJson(await f.text());
      this.snack.open(`Se cargaron ${n} registro(s).`, undefined, { duration: 4000 });
    } catch (e: any) {
      this.snack.open('No se pudo cargar: ' + (e?.message ?? e), 'Cerrar', { duration: 8000 });
    }
  }

  saltar(ev: Event) {
    ev.preventDefault();
    document.getElementById('contenido')?.focus();
  }
}
