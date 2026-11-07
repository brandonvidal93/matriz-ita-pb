import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { firstValueFrom } from 'rxjs';
import { AlmacenService } from '../core/almacen.service';
import { ITEM_POR_FILA, etiquetaCorta } from '../core/catalogo';
import { Evidencia } from '../core/modelos';
import { verificarUrl } from '../core/progreso';
import { AsignarDialog, ConfirmarDialog, EvidenciaDialog } from '../dialogos/dialogos';

@Component({
  imports: [DatePipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatMenuModule, MatProgressBarModule, MatTooltipModule],
  styles: `
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .03em; color: var(--texto-suave); padding: 10px 12px; border-bottom: 1px solid var(--borde); background: #f7f9fc; }
    td { padding: 10px 12px; border-bottom: 1px solid #edf0f4; vertical-align: top; }
    tr.abierta td { background: #fbfcfe; }
  `,
  template: `
    @if (almacen.activo(); as reg) {
      <div class="max-w-[1300px] mx-auto px-4 py-5">
        <div class="flex items-end gap-3 flex-wrap mb-3">
          <div class="flex-1 min-w-[260px]">
            <h1 class="text-2xl font-semibold m-0">Biblioteca de evidencias</h1>
            <p class="texto-suave m-0 mt-1">Registra cada URL una sola vez y asígnala a todos los ítems que respalda.</p>
          </div>
          <mat-form-field class="sin-pie w-[300px]">
            <mat-icon matPrefix>search</mat-icon>
            <mat-label>Buscar evidencia</mat-label>
            <input matInput [ngModel]="q()" (ngModelChange)="q.set($event)" />
          </mat-form-field>
          @if (!almacen.soloLectura()) {
            <button mat-stroked-button (click)="verificarTodas()" [disabled]="verificando()"><mat-icon>network_check</mat-icon>Verificar enlaces</button>
            <button mat-flat-button (click)="nueva()"><mat-icon>add_link</mat-icon>Nueva evidencia</button>
          }
        </div>
        @if (verificando()) {
          <mat-progress-bar mode="determinate" [value]="avance()" class="mb-2" />
        }
        <p class="text-xs texto-suave mt-0">
          La verificación comprueba que el servidor responda; por seguridad del navegador no puede distinguir una página 404. Abre las dudosas para confirmar.
        </p>

        <div class="tarjeta overflow-x-auto">
          <table>
            <caption class="sr-only" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Evidencias del registro {{ reg.nombre }}</caption>
            <thead>
              <tr><th scope="col">Evidencia</th><th scope="col">Ítems</th><th scope="col">Verificación</th><th scope="col"><span class="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              @for (e of lista(); track e.id) {
                @let usos = almacen.usos(e.id, reg);
                <tr [class.abierta]="abierta() === e.id">
                  <td class="max-w-[640px]">
                    <div class="font-medium">{{ e.titulo }}</div>
                    <a class="mono break-all" [href]="e.url" target="_blank" rel="noopener">{{ e.url }}</a>
                    @if (e.descripcion) { <div class="text-sm texto-suave mt-1">{{ e.descripcion }}</div> }
                    @if (abierta() === e.id) {
                      <ul class="text-sm mt-2 mb-0 pl-5">
                        @for (f of usos; track f) {
                          <li><a [routerLink]="['/r', reg.id]" [queryParams]="{ fila: f }">{{ corta(f) }}</a></li>
                        }
                      </ul>
                    }
                  </td>
                  <td class="whitespace-nowrap">
                    <button mat-button (click)="abierta.set(abierta() === e.id ? null : e.id)" [disabled]="!usos.length" [attr.aria-expanded]="abierta() === e.id">
                      {{ usos.length }} ítem{{ usos.length === 1 ? '' : 's' }}
                      @if (usos.length) { <mat-icon iconPositionEnd>{{ abierta() === e.id ? 'expand_less' : 'expand_more' }}</mat-icon> }
                    </button>
                  </td>
                  <td class="whitespace-nowrap text-sm">
                    @switch (e.verificacion?.estado) {
                      @case ('ok') { <span class="chip-estado SI">Responde</span> }
                      @case ('error') { <span class="chip-estado NO">Sin respuesta</span> }
                      @default { <span class="texto-suave">—</span> }
                    }
                    @if (e.verificacion) { <div class="text-xs texto-suave mt-1">{{ e.verificacion.fecha | date: 'd MMM, h:mm a' }}</div> }
                  </td>
                  <td class="whitespace-nowrap text-right">
                    @if (!almacen.soloLectura()) {
                    <button mat-stroked-button (click)="asignar(e, usos)">Asignar a ítems</button>
                    <button mat-icon-button [matMenuTriggerFor]="m" [attr.aria-label]="'Más acciones para ' + e.titulo"><mat-icon>more_vert</mat-icon></button>
                    <mat-menu #m="matMenu">
                      <button mat-menu-item (click)="editar(e)"><mat-icon>edit</mat-icon>Editar</button>
                      <button mat-menu-item (click)="verificar(e)"><mat-icon>network_check</mat-icon>Verificar</button>
                      <button mat-menu-item (click)="eliminar(e, usos.length)"><mat-icon>delete</mat-icon>Eliminar</button>
                    </mat-menu>
                    }
                  </td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="texto-suave p-6">No hay evidencias{{ q() ? ' que coincidan' : ' todavía' }}.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </div>
    }
  `,
})
export class EvidenciasPage {
  protected almacen = inject(AlmacenService);
  private dialog = inject(MatDialog);
  q = signal('');
  abierta = signal<string | null>(null);
  verificando = signal(false);
  avance = signal(0);
  corta = (f: number) => {
    const it = ITEM_POR_FILA.get(f);
    return it ? `${it.nivel1 ? it.nivel1.slice(0, 40) + ' › ' : ''}${etiquetaCorta(it, 110)}` : 'Fila ' + f;
  };

  lista = computed(() => {
    const t = this.q().toLowerCase().trim();
    const evs = this.almacen.activo()?.evidencias ?? [];
    return t ? evs.filter((e) => `${e.titulo} ${e.url} ${e.descripcion ?? ''}`.toLowerCase().includes(t)) : evs;
  });

  async nueva() {
    const d = await firstValueFrom(this.dialog.open(EvidenciaDialog, { data: {} }).afterClosed());
    if (d) {
      const ev = this.almacen.agregarEvidencia(d);
      this.asignar(ev, this.almacen.usos(ev.id));
    }
  }

  async editar(e: Evidencia) {
    const d = await firstValueFrom(this.dialog.open(EvidenciaDialog, { data: { evidencia: e } }).afterClosed());
    if (d) this.almacen.editarEvidencia(e.id, { titulo: d.titulo, url: d.url, descripcion: d.descripcion, verificacion: d.url !== e.url ? undefined : e.verificacion });
  }

  asignar(e: Evidencia, usos: number[]) {
    this.dialog.open(AsignarDialog, { data: { evidencia: e, usos }, maxWidth: '95vw' });
  }

  async eliminar(e: Evidencia, n: number) {
    const ok = await firstValueFrom(
      this.dialog
        .open(ConfirmarDialog, {
          data: { titulo: 'Eliminar evidencia', mensaje: `“${e.titulo}” se quitará de ${n} ítem(s).`, accion: 'Eliminar' },
        })
        .afterClosed(),
    );
    if (ok) this.almacen.eliminarEvidencia(e.id);
  }

  async verificar(e: Evidencia) {
    const estado = await verificarUrl(e.url);
    this.almacen.editarEvidencia(e.id, { verificacion: { fecha: new Date().toISOString(), estado } });
  }

  async verificarTodas() {
    const evs = this.almacen.activo()?.evidencias ?? [];
    this.verificando.set(true);
    let hechas = 0;
    const cola = [...evs];
    const trabajador = async () => {
      while (cola.length) {
        const e = cola.shift()!;
        await this.verificar(e);
        this.avance.set(Math.round((++hechas / evs.length) * 100));
      }
    };
    await Promise.all(Array.from({ length: 5 }, trabajador));
    this.verificando.set(false);
  }
}
