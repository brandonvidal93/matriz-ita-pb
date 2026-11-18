import { HttpErrorResponse, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { Formato } from './modelos';
import { SesionService } from './sesion.service';

/** Exige sesión iniciada; si el usuario debe cambiar su contraseña, lo lleva a hacerlo. */
export const conSesion: CanActivateFn = async (_ruta, estado) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const u = await auth.asegurarSesion();
  if (!u) return router.createUrlTree(['/ingresar'], { queryParams: { volver: estado.url } });
  if (u.debeCambiarClave) return router.createUrlTree(['/ingresar'], { queryParams: { cambiar: 1 } });
  return true;
};

export const soloAdmin: CanActivateFn = async () => {
  // inject() solo funciona antes del primer await.
  const auth = inject(AuthService);
  const router = inject(Router);
  await auth.asegurarSesion();
  return auth.esAdmin() || router.createUrlTree(['/']);
};

/** Exige acceso al formato; sin él, vuelve al panel. */
export const conFormato =
  (formato: Formato): CanActivateFn =>
  async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.asegurarSesion();
    return auth.puede(formato, 'ver') || router.createUrlTree(['/']);
  };

/** Lleva la cuenta de la sesión y, si la API responde 401 (sesión vencida), vuelve a la pantalla de ingreso. */
export const interceptorSesion: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const sesion = inject(SesionService);
  return next(req).pipe(
    tap((ev) => {
      const minutos = ev instanceof HttpResponse ? Number(ev.headers.get('X-Sesion-Minutos')) : 0;
      if (minutos > 0) sesion.actividad(minutos);
    }),
    catchError((e: unknown) => {
      if (e instanceof HttpErrorResponse && !req.url.startsWith('/api/auth/')) {
        if (e.status === 401 && auth.usuario()) {
          auth.sesionTerminada();
          router.navigate(['/ingresar'], { queryParams: { vencida: 1 } });
        } else if (e.status === 403 && e.error?.codigo === 'cambiar-clave') {
          router.navigate(['/ingresar'], { queryParams: { cambiar: 1 } });
        }
      }
      return throwError(() => e);
    }),
  );
};
