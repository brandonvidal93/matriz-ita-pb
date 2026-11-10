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
import { errorSi } from '../core/foco';
import { Esqueleto } from '../core/esqueleto';
import { Rol, Usuario, claveRol } from '../core/modelos';
import { problemaClave } from './ingresar';

type UsuarioLista = Usuario & { creado?: string; ultimoIngreso?: string | null };


interface DatosUsuarioDialog {
  usuario?: UsuarioLista;
}

@Component({
  imports: [FormsModule, MatButtonModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatSelectModule, TranslocoPipe],
  templateUrl: './usuario-dialog.html',
})
export class UsuarioDialog {
  d = inject<DatosUsuarioDialog>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef);
  private t = inject(TranslocoService);
  m = { usuario: '', nombre: this.d.usuario?.nombre ?? '', rol: (this.d.usuario?.rol ?? 'editor') as Rol, clave: '' };
  error = signal<string | null>(null);
  private campoError = signal<string | null>(null);
  errUsuario = errorSi(() => this.campoError() === 'usuario');
  errNombre = errorSi(() => this.campoError() === 'nombre');
  errClave = errorSi(() => this.campoError() === 'clave');

  private fallo(campo: string, clave: string) {
    this.error.set(this.t.translate(clave));
    this.campoError.set(campo);
    document.querySelector<HTMLElement>(`mat-dialog-container input[name=${campo}]`)?.focus();
  }

  guardar() {
    if (!this.d.usuario && !/^[a-zA-Z0-9._-]{3,60}$/.test(this.m.usuario.trim()))
      return this.fallo('usuario', 'usuarios.dialogo.errorUsuario');
    if (!this.m.nombre.trim()) return this.fallo('nombre', 'usuarios.dialogo.errorNombre');
    if (this.m.clave || !this.d.usuario) {
      const p = problemaClave(this.m.clave);
      if (p) return this.fallo('clave', p);
    }
    this.ref.close(this.m);
  }
}

@Component({
  imports: [Esqueleto, FechaPipe, MatButtonModule, MatIconModule, MatMenuModule, TranslocoPipe],
  styles: `
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 12px; color: var(--texto-suave); padding: 10px 12px; border-bottom: 1px solid var(--borde); }
    td { padding: 10px 12px; border-bottom: 1px solid #edf0f4; }
    tr.inactivo td { color: var(--texto-suave); }
  `,
  templateUrl: './usuarios.html',
})
export class UsuariosPage {
  protected auth = inject(AuthService);
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  private t = inject(TranslocoService);
  usuarios = signal<UsuarioLista[] | null>(null);
  claveRol = claveRol;

  constructor() {
    this.cargar();
  }

  async cargar() {
    try {
      this.usuarios.set(await firstValueFrom(this.http.get<UsuarioLista[]>('/api/usuarios')));
    } catch (e) {
      this.aviso(e);
      this.usuarios.update((u) => u ?? []); // sin datos, se muestra la tabla vacía en lugar del esqueleto
    }
  }

  async nuevo() {
    const m = await firstValueFrom(this.dialog.open(UsuarioDialog, { data: {} }).afterClosed());
    if (!m) return;
    try {
      await firstValueFrom(this.http.post('/api/usuarios', { ...m, usuario: m.usuario.trim() }));
      this.snack.open(this.t.translate('usuarios.creado'), this.t.translate('comun.cerrar'));
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
      this.snack.open(this.t.translate('usuarios.actualizado'), this.t.translate('comun.cerrar'));
      await this.cargar();
    } catch (e) {
      this.aviso(e);
    }
  }

  private aviso(e: unknown) {
    this.snack.open(mensajeError(e), this.t.translate('comun.cerrar'));
  }
}
