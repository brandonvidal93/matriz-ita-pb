import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { firstValueFrom } from 'rxjs';
import { AuthService, mensajeError } from '../core/auth.service';
import { NOMBRE_ROL, Rol, Usuario } from '../core/modelos';
import { problemaClave } from './ingresar';

type UsuarioLista = Usuario & { creado?: string; ultimoIngreso?: string | null };


interface DatosUsuarioDialog {
  usuario?: UsuarioLista;
}

@Component({
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ d.usuario ? 'Editar ' + d.usuario.usuario : 'Nuevo usuario' }}</h2>
    <form (ngSubmit)="guardar()">
      <mat-dialog-content class="grid gap-3 !pt-2 min-w-[min(420px,80vw)]">
        @if (!d.usuario) {
          <mat-form-field class="sin-pie">
            <mat-label>Usuario</mat-label>
            <input matInput name="usuario" [(ngModel)]="m.usuario" required autocomplete="off" placeholder="p. ej. jperez" />
          </mat-form-field>
        }
        <mat-form-field class="sin-pie">
          <mat-label>Nombre completo</mat-label>
          <input matInput name="nombre" [(ngModel)]="m.nombre" required />
        </mat-form-field>
        <mat-form-field>
          <mat-label>Rol</mat-label>
          <mat-select name="rol" [(ngModel)]="m.rol">
            <mat-option value="lector">Lector: solo consulta y exporta</mat-option>
            <mat-option value="editor">Editor: diligencia la matriz</mat-option>
            <mat-option value="admin">Administrador: además gestiona usuarios y elimina registros</mat-option>
          </mat-select>
        </mat-form-field>
        <mat-form-field>
          <mat-label>{{ d.usuario ? 'Nueva contraseña temporal (opcional)' : 'Contraseña temporal' }}</mat-label>
          <input matInput name="clave" type="password" autocomplete="new-password" [(ngModel)]="m.clave" [required]="!d.usuario" />
          <mat-hint>La persona deberá cambiarla al ingresar. Mínimo 10 caracteres, letras y números.</mat-hint>
        </mat-form-field>
        @if (error()) { <p class="text-sm m-0" style="color: var(--no)" role="alert">{{ error() }}</p> }
      </mat-dialog-content>
      <mat-dialog-actions align="end">
        <button mat-button type="button" mat-dialog-close>Cancelar</button>
        <button mat-flat-button type="submit">Guardar</button>
      </mat-dialog-actions>
    </form>
  `,
})
export class UsuarioDialog {
  d = inject<DatosUsuarioDialog>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef);
  m = { usuario: '', nombre: this.d.usuario?.nombre ?? '', rol: (this.d.usuario?.rol ?? 'editor') as Rol, clave: '' };
  error = signal<string | null>(null);

  guardar() {
    if (!this.d.usuario && !/^[a-zA-Z0-9._-]{3,60}$/.test(this.m.usuario.trim()))
      return this.error.set('El usuario debe tener de 3 a 60 caracteres: letras, números, punto, guion o guion bajo.');
    if (!this.m.nombre.trim()) return this.error.set('Escribe el nombre.');
    if (this.m.clave || !this.d.usuario) {
      const p = problemaClave(this.m.clave);
      if (p) return this.error.set(p);
    }
    this.ref.close(this.m);
  }
}

@Component({
  imports: [DatePipe, MatButtonModule, MatIconModule, MatMenuModule],
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
          <h1 class="text-2xl font-semibold m-0">Usuarios</h1>
          <p class="texto-suave m-0 mt-1">Quién puede ingresar a la Matriz ITA y qué puede hacer.</p>
        </div>
        <button mat-flat-button (click)="nuevo()"><mat-icon>person_add</mat-icon>Nuevo usuario</button>
      </div>
      <div class="tarjeta overflow-x-auto">
        <table>
          <thead>
            <tr><th scope="col">Nombre</th><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Último ingreso</th><th scope="col"><span class="sr-only">Acciones</span></th></tr>
          </thead>
          <tbody>
            @for (u of usuarios(); track u.id) {
              <tr [class.inactivo]="!u.activo">
                <td>
                  {{ u.nombre }}
                  @if (!u.activo) { <span class="chip-estado NA ml-2">Inactivo</span> }
                  @if (u.activo && u.debeCambiarClave) { <span class="chip-estado pendiente ml-2">Clave temporal</span> }
                </td>
                <td class="mono">{{ u.usuario }}</td>
                <td>{{ nombreRol[u.rol] }}</td>
                <td class="text-sm">{{ u.ultimoIngreso ? (u.ultimoIngreso | date: 'd MMM y, h:mm a') : '—' }}</td>
                <td class="text-right whitespace-nowrap">
                  <button mat-icon-button [matMenuTriggerFor]="m" [attr.aria-label]="'Acciones para ' + u.nombre"><mat-icon>more_vert</mat-icon></button>
                  <mat-menu #m="matMenu">
                    <button mat-menu-item (click)="editar(u)"><mat-icon>edit</mat-icon>Editar o restablecer contraseña</button>
                    @if (u.id !== auth.usuario()?.id) {
                      <button mat-menu-item (click)="cambiar(u, { activo: !u.activo })">
                        <mat-icon>{{ u.activo ? 'person_off' : 'person' }}</mat-icon>{{ u.activo ? 'Desactivar' : 'Activar' }}
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
  usuarios = signal<UsuarioLista[]>([]);
  nombreRol = NOMBRE_ROL;

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
      this.snack.open(`Usuario creado. Entrégale la contraseña temporal por un canal seguro.`, undefined, { duration: 6000 });
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
      this.snack.open('Usuario actualizado.', undefined, { duration: 3000 });
      await this.cargar();
    } catch (e) {
      this.aviso(e);
    }
  }

  private aviso(e: unknown) {
    this.snack.open(mensajeError(e), 'Cerrar', { duration: 8000 });
  }
}
