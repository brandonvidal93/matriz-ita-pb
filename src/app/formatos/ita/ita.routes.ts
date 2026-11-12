import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';
import { AlmacenService } from '../../core/almacen.service';

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
  return router.createUrlTree(['/ita']);
};

/** Matriz ITA 2023: `#/ita` y `#/ita/r/:id`. */
export const rutasIta: Routes = [
  { path: '', title: 'titulos.registros', loadComponent: () => import('./registros').then((m) => m.RegistrosPage) },
  {
    path: 'r/:id',
    canActivate: [activarRegistro],
    children: [
      { path: '', title: 'titulos.diligenciar', loadComponent: () => import('./diligenciar').then((m) => m.DiligenciarPage) },
      { path: 'evidencias', title: 'titulos.evidencias', loadComponent: () => import('./evidencias').then((m) => m.EvidenciasPage) },
      { path: 'resumen', title: 'titulos.resumen', loadComponent: () => import('./resumen').then((m) => m.ResumenPage) },
    ],
  },
];
