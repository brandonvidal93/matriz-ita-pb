import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';
import { EvaluacionesService } from './evaluaciones.service';

/** Carga la versión más reciente de la evaluación (incluye cambios de otras personas). */
export const activarEvaluacion: CanActivateFn = async (ruta: ActivatedRouteSnapshot) => {
  const svc = inject(EvaluacionesService);
  const router = inject(Router);
  const id = ruta.paramMap.get('id');
  try {
    if (id && (await svc.refrescar(id))) {
      svc.activaId.set(id);
      return true;
    }
  } catch {
    /* sin conexión o sin permiso: se vuelve al listado */
  }
  return router.createUrlTree(['/accesibilidad']);
};

/** Matriz de evaluación - Nivel de Accesibilidad: `#/accesibilidad` y `#/accesibilidad/e/:id/<hoja>`. */
export const rutasAccesibilidad: Routes = [
  { path: '', title: 'titulos.acc.lista', loadComponent: () => import('./lista').then((m) => m.ListaAccPage) },
  {
    path: 'e/:id',
    canActivate: [activarEvaluacion],
    loadComponent: () => import('./evaluacion').then((m) => m.EvaluacionPage),
    children: [
      { path: '', title: 'titulos.acc.identificacion', loadComponent: () => import('./hojas').then((m) => m.IdentificacionPage) },
      { path: 'criterios', title: 'titulos.acc.criterios', loadComponent: () => import('./criterios').then((m) => m.CriteriosPage) },
      { path: 'hallazgos', title: 'titulos.acc.hallazgos', loadComponent: () => import('./hojas').then((m) => m.HallazgosPage) },
      { path: 'cierre', title: 'titulos.acc.cierre', loadComponent: () => import('./hojas').then((m) => m.CierrePage) },
    ],
  },
];
