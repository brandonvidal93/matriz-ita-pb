import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';
import { AlmacenService } from './core/almacen.service';
import { conSesion, soloAdmin } from './core/guardias';

/** Carga la versión más reciente del registro (incluye cambios de otras personas). */
export const activarRegistro: CanActivateFn = async (ruta: ActivatedRouteSnapshot) => {
  const almacen = inject(AlmacenService);
  const router = inject(Router);
  const id = ruta.paramMap.get('id');
  try {
    if (id && (await almacen.refrescar(id))) {
      almacen.activoId.set(id);
      return true;
    }
  } catch {
    /* sin conexión o sin permiso: se vuelve al listado */
  }
  return router.createUrlTree(['/']);
};

export const routes: Routes = [
  { path: 'ingresar', title: 'Ingresar · Matriz ITA', loadComponent: () => import('./paginas/ingresar').then((m) => m.IngresarPage) },
  {
    path: '',
    canActivate: [conSesion],
    children: [
      { path: '', title: 'Registros · Matriz ITA', loadComponent: () => import('./paginas/registros').then((m) => m.RegistrosPage) },
      {
        path: 'usuarios',
        canActivate: [soloAdmin],
        title: 'Usuarios · Matriz ITA',
        loadComponent: () => import('./paginas/usuarios').then((m) => m.UsuariosPage),
      },
      {
        path: 'r/:id',
        canActivate: [activarRegistro],
        children: [
          { path: '', title: 'Diligenciar · Matriz ITA', loadComponent: () => import('./paginas/diligenciar').then((m) => m.DiligenciarPage) },
          { path: 'evidencias', title: 'Evidencias · Matriz ITA', loadComponent: () => import('./paginas/evidencias').then((m) => m.EvidenciasPage) },
          { path: 'resumen', title: 'Revisión y exportación · Matriz ITA', loadComponent: () => import('./paginas/resumen').then((m) => m.ResumenPage) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
