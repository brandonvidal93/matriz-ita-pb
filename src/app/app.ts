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
import { DriveService } from './core/drive.service';
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
        @if (drive.conectado()) {
          <button mat-stroked-button class="!text-white !border-white/50" [matMenuTriggerFor]="menuDrive">
            <mat-icon>cloud_done</mat-icon> {{ drive.usuario() || 'Google Drive' }}
          </button>
          <mat-menu #menuDrive="matMenu">
            <button mat-menu-item (click)="almacen.sincronizarPendientes()"><mat-icon>sync</mat-icon>Sincronizar ahora</button>
            <button mat-menu-item (click)="almacen.desconectarDrive()"><mat-icon>logout</mat-icon>Desconectar</button>
          </mat-menu>
        } @else {
          <button mat-stroked-button class="!text-white !border-white/50" (click)="conectar()"
            [matTooltip]="drive.configurado ? 'Guardar y traer los registros desde Google Drive' : 'Falta configurar el ID de cliente de Google (src/app/config.ts)'">
            <mat-icon>add_to_drive</mat-icon> Conectar Drive
          </button>
        }
      </div>
    </header>
    <main id="contenido" tabindex="-1" class="outline-none">
      <router-outlet />
    </main>
  `,
})
export class App {
  protected almacen = inject(AlmacenService);
  protected drive = inject(DriveService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);
  institucion = CONFIG.institucion;
  dependencia = CONFIG.dependencia;

  private url = toSignal(this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.router.url)), { initialValue: '' });
  activo = computed(() => (this.url().startsWith('/r/') ? this.almacen.activo() : null));

  textoSync = computed(() => {
    switch (this.almacen.estadoSync()) {
      case 'local': return 'Guardado en este navegador';
      case 'pendiente': return 'Cambios por subir…';
      case 'sincronizando': return 'Sincronizando con Drive…';
      case 'sincronizado': return 'Guardado en Drive';
      case 'error': return 'Error al sincronizar';
    }
  });

  async conectar() {
    if (!this.drive.configurado) {
      this.snack.open('Configura googleClientId en src/app/config.ts para usar Google Drive.', 'Entendido', { duration: 8000 });
      return;
    }
    try {
      await this.almacen.conectarDrive();
      this.snack.open('Conectado a Google Drive. Registros sincronizados.', undefined, { duration: 4000 });
    } catch (e: any) {
      this.snack.open('No se pudo conectar con Drive: ' + (e?.message ?? e), 'Cerrar', { duration: 10000 });
    }
  }

  saltar(ev: Event) {
    ev.preventDefault();
    document.getElementById('contenido')?.focus();
  }
}
