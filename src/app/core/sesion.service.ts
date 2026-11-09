import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AvisoSesionDialog } from '../dialogos/aviso-sesion';
import { AlmacenService } from './almacen.service';
import { AuthService } from './auth.service';

/** Con cuánta anticipación se avisa, salvo que la sesión sea tan corta que convenga la mitad de su duración. */
export const AVISO_MS = 5 * 60_000;
const CLAVE = 'matriz-ita.sesion-vence';

/**
 * Avisa antes de que la sesión venza por inactividad y permite extenderla (WCAG 2.2.1).
 * Cada respuesta de la API la renueva; el vencimiento se comparte entre pestañas,
 * porque la actividad en una extiende la misma sesión en todas.
 */
@Injectable({ providedIn: 'root' })
export class SesionService {
  private http = inject(HttpClient);
  private dialog = inject(MatDialog);
  private auth = inject(AuthService);
  private almacen = inject(AlmacenService);
  private router = inject(Router);

  private vence = 0;
  private duracionMs = 0;
  private temporizador?: ReturnType<typeof setTimeout>;
  private aviso: MatDialogRef<AvisoSesionDialog> | null = null;

  constructor() {
    addEventListener('storage', (e) => {
      if (e.key !== CLAVE || !this.vence) return;
      // Sin valor: otra pestaña cerró la sesión, que es la misma.
      if (e.newValue === null) this.terminar();
      else this.programar();
    });
  }

  /** Registra que el servidor acaba de renovar la sesión por `minutos` más. */
  actividad(minutos: number): void {
    this.duracionMs = minutos * 60_000;
    this.vence = Date.now() + this.duracionMs;
    try {
      localStorage.setItem(CLAVE, String(this.vence));
    } catch {
      // Sin almacenamiento: el aviso solo tendrá en cuenta la actividad de esta pestaña.
    }
    this.programar();
  }

  private venceCompartido(): number {
    try {
      return Math.max(this.vence, Number(localStorage.getItem(CLAVE)) || 0);
    } catch {
      return this.vence;
    }
  }

  private programar(): void {
    clearTimeout(this.temporizador);
    if (!this.auth.usuario() && this.auth.verificado()) return this.detener();
    const vence = this.venceCompartido();
    const restante = vence - Date.now();
    const anticipacion = Math.min(AVISO_MS, this.duracionMs / 2);
    if (restante <= 0) return this.terminar();
    if (restante <= anticipacion) {
      this.mostrarAviso(vence);
      this.temporizador = setTimeout(() => this.programar(), restante);
    } else {
      this.aviso?.close();
      this.temporizador = setTimeout(() => this.programar(), restante - anticipacion);
    }
  }

  private mostrarAviso(vence: number): void {
    if (this.aviso) return;
    this.aviso = this.dialog.open(AvisoSesionDialog, {
      data: { vence },
      role: 'alertdialog',
      ariaDescribedBy: 'aviso-sesion-mensaje',
      // Hay que elegir: al cerrarlo sin querer, la sesión vencería sin otra advertencia.
      disableClose: true,
    });
    this.aviso.afterClosed().subscribe((decision) => {
      this.aviso = null;
      if (decision === 'seguir') this.extender();
      if (decision === 'salir') this.salir();
    });
  }

  /** Cualquier petición con sesión la renueva; si falla, sigue corriendo el tiempo y se vuelve a avisar. */
  private async extender(): Promise<void> {
    try {
      await firstValueFrom(this.http.get('/api/auth/yo'));
    } catch {
      this.programar();
    }
  }

  private async salir(): Promise<void> {
    await this.almacen.vaciar();
    await this.auth.salir();
    this.almacen.limpiar();
    this.detener();
    this.router.navigate(['/ingresar']);
  }

  /** Venció: se hace lo mismo que al recibir un 401, sin esperar a la siguiente petición. */
  private terminar(): void {
    this.detener();
    this.auth.sesionTerminada();
    this.almacen.limpiar();
    this.router.navigate(['/ingresar'], { queryParams: { vencida: 1 } });
  }

  private detener(): void {
    clearTimeout(this.temporizador);
    this.vence = 0;
    this.aviso?.close();
    try {
      localStorage.removeItem(CLAVE);
    } catch {
      // No hay nada que limpiar.
    }
  }
}
