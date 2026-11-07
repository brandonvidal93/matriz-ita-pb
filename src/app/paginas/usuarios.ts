import { HttpClient } from '@angular/common/http';
import { FechaPipe } from '../core/idioma';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { AuthService, mensajeError } from '../core/auth.service';
import { Rol, Usuario, claveRol } from '../core/modelos';
import { problemaClave } from './ingresar';

type UsuarioLista = Usuario & { creado?: string; ultimoIngreso?: string | null };


interface DatosUsuarioDialog {
  usuario?: UsuarioLista;
}

@Component({
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  template: `
    <h2 mat-dialog-title>{{ d.usuario ? ('usuarios.dialogo.editar' | transloco: { usuario: d.usuario.usuario }) : ('usuarios.nuevo' | transloco) }}</h2>
    <form (ngSubmit)="guardar()">
      <mat-dialog-content class="grid gap-3 !pt-2 min-w-[min(420px,80vw)]">
        @if (!d.usuario) {
          <mat-form-field class="sin-pie">
            <mat-label>{{ 'usuarios.col.usuario' | transloco }}</mat-label>
            <input matInput name="usuario" [(ngModel)]="m.usuario" required autocomplete="off" [placeholder]="'usuarios.dialogo.ejemplo' | transloco" />
          </mat-form-field>
        }
        <mat-form-field class="sin-pie">
          <mat-label>{{ 'usuarios.dialogo.nombre' | transloco }}</mat-label>
          <input matInput name="nombre" [(ngModel)]="m.nombre" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ 'usuarios.col.rol' | transloco }}</mat-label>
          <mat-select name="rol" [(ngModel)]="m.rol">
            <mat-option value="lector">{{ 'usuarios.dialogo.rolLector' | transloco }}</mat-option>
            <mat-option value="editor">{{ 'usuarios.dialogo.rolEditor' | transloco }}</mat-option>
            <mat-option value="admin">{{ 'usuarios.dialogo.rolAdmin' | transloco }}</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ (d.usuario ? 'usuarios.dialogo.claveNueva' : 'usuarios.dialogo.claveTemporal') | transloco }}</mat-label>
          <input matInput name="clave" type="password" autocomplete="new-password" [(ngModel)]="m.clave" [required]="!d.usuario" />
          <mat-hint>{{ 'usuarios.dialogo.pista' | transloco }}</mat-hint>
        </mat-form-field>
        @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>{{ 'comun.cancelar' | transloco }}</button>
        <button mat-flat-button type="submit">{{ 'comun.guardar' | transloco }}</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class UsuarioDialog {
  d = inject<DatosUsuarioDialog>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef);
  private t = inject(TranslocoService);
  m = { usuario: '', nombre: this.d.usuario?.nombre ?? '', rol: (this.d.usuario?.rol ?? 'editor') as Rol, clave: '' };
  error = signal<string | null>(null);

  guardar() {
    if (!this.d.usuario && !/^[a-zA-Z0-9._-]{3,60}$/.test(this.m.usuario.trim()))
      return this.error.set(this.t.translate('usuarios.dialogo.errorUsuario'));
    if (!this.m.nombre.trim()) return this.error.set(this.t.translate('usuarios.dialogo.errorNombre'));
    if (this.m.clave || !this.d.usuario) {
      const p = problemaClave(this.m.clave);
      if (p) return this.error.set(this.t.translate(p));
    }
    this.ref.close(this.m);
  }
}

@Component({
  imports: [FechaPipe, MatButtonModule, MatIconModule, MatMenuModule, TranslocoPipe],
  styles: `
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; color: var(--texto-suave); padding: 10px 12px; border-bottom: 1px solid var(--borde); }
    td { padding: 10px 12px; border-bottom: 1px solid #edf0f4; }
    tr.inactivo td { color: var(--texto-suave); }
  `,
  template: `
    <div class="max-w-[1100px] mx-auto px-4 py-5">
      <div class="flex items-end gap-3 flex-wrap mb-3">
        <div class="flex-1 min-w-[260px]">
          <h1 class="text-2xl font-semibold m-0">{{ 'usuarios.titulo' | transloco }}</h1>
          <p class="texto-suave m-0 mt-1">{{ 'usuarios.descripcion' | transloco }}</p>
        </div>
        <button mat-flat-button (click)="nuevo()"><mat-icon>person_add</mat-icon>{{ 'usuarios.nuevo' | transloco }}</button>
      </div>
      <div class="tarjeta overflow-x-auto">
        <table>
          <thead>
            <tr><th scope="col">{{ 'usuarios.col.nombre' | transloco }}</th><th scope="col">{{ 'usuarios.col.usuario' | transloco }}</th><th scope="col">{{ 'usuarios.col.rol' | transloco }}</th><th scope="col">{{ 'usuarios.col.ultimoIngreso' | transloco }}</th><th scope="col"><span class="sr-only">{{ 'usuarios.col.acciones' | transloco }}</span></th></tr>
          </thead>
          <tbody>
            @for (u of usuarios(); track u.id) {
              <tr [class.inactivo]="!u.activo">
                <td>
                  {{ u.nombre }}
                  @if (!u.activo) { <span class="chip-estado NA ml-2">{{ 'usuarios.inactivo' | transloco }}</span> }
                  @if (u.activo && u.debeCambiarClave) { <span class="chip-estado pendiente ml-2">{{ 'usuarios.claveTemporal' | transloco }}</span> }
                </td>
                <td class="mono">{{ u.usuario }}</td>
                <td>{{ claveRol(u.rol) | transloco }}</td>
                <td class="text-sm">{{ u.ultimoIngreso ? (u.ultimoIngreso | fecha: 'd MMM y, h:mm a') : '—' }}</td>
                <td class="text-right whitespace-nowrap">
                  <button mat-icon-button [matMenuTriggerFor]="m" [attr.aria-label]="'usuarios.acciones' | transloco: { nombre: u.nombre }"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #m="matMenu">
                    <button mat-menu-item (click)="editar(u)"><mat-icon>edit</mat-icon>{{ 'usuarios.editar' | transloco }}</button>
                    @if (u.id !== auth.usuario()?.id) {
                      <button mat-menu-item (click)="cambiar(u, { activo: !u.activo })">
                        <mat-icon>{{ u.activo ? 'person_off' : 'person' }}</mat-icon>{{ (u.activo ? 'usuarios.desactivar' : 'usuarios.activar') | transloco }}
                      </button>
                    }
                  </mat-menu>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </div>
    </div>
  `,
})
export class UsuariosPage {
  protected auth = inject(AuthService);
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  usuarios = signal<UsuarioLista[]>([]);
  claveRol = claveRol;

  constructor() {
    this.cargar();
  }

  async cargar() {
    try {
      this.usuarios.set(await firstValueFrom(this.http.get<UsuarioLista[]>('/api/usuarios')));
    } catch (e) {
      this.aviso(e);
    }
  }

  async nuevo() {
    const m = await firstValueFrom(this.dialog.open(UsuarioDialog, { data: {} }).afterClosed());
    if (!m) return;
    try {
      await firstValueFrom(this.http.post('/api/usuarios', { ...m, usuario: m.usuario.trim() }));
      this.snack.open(this.t.translate('usuarios.creado'), undefined, { duration: 6000 });
      await this.cargar();
    } catch (e) {
      this.aviso(e);
    }
  }

  async editar(u: UsuarioLista) {
    const m = await firstValueFrom(this.dialog.open(UsuarioDialog, { data: { usuario: u } }).afterClosed());
    if (!m) return;
    await this.cambiar(u, { nombre: m.nombre, rol: m.rol, ...(m.clave ? { clave: m.clave } : {}) });
  }

  async cambiar(u: UsuarioLista, cambios: object) {
    try {
      await firstValueFrom(this.http.patch(`/api/usuarios/${u.id}`, cambios));
      this.snack.open(this.t.translate('usuarios.actualizado'), undefined, { duration: 3000 });
      await this.cargar();
    } catch (e) {
      this.aviso(e);
    }
  }

  private aviso(e: unknown) {
    this.snack.open(mensajeError(e), this.t.translate('comun.cerrar'), { duration: 8000 });
  }
}
