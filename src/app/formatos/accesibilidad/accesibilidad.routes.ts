import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';
import { FUENTE_EVIDENCIAS } from '../../core/evidencias';
import { EvaluacionesService } from './evaluaciones.service';
import { fuenteAccesibilidad } from './fuente';

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

/**
 * Matriz de evaluación - Nivel de Accesibilidad. Mismas páginas que ITA (regla para todos los formatos):
 * `#/accesibilidad`, `…/r/:id` (diligenciar), `…/r/:id/evidencias` y `…/r/:id/resumen`.
 */
export const rutasAccesibilidad: Routes = [
  { path: '', title: 'titulos.acc.lista', loadComponent: () => import('./lista').then((m) => m.ListaAccPage) },
  {
    path: 'r/:id',
    canActivate: [activarEvaluacion],
    providers: [{ provide: FUENTE_EVIDENCIAS, useFactory: fuenteAccesibilidad }],
    data: { miga: '@registro' },
    children: [
      { path: '', title: 'titulos.diligenciar', data: { miga: 'titulos.diligenciar' }, loadComponent: () => import('./diligenciar').then((m) => m.DiligenciarAccPage) },
      { path: 'evidencias', title: 'titulos.evidencias', data: { miga: 'titulos.evidencias' }, loadComponent: () => import('../../paginas/evidencias').then((m) => m.EvidenciasPage) },
      { path: 'resumen', title: 'titulos.resumen', data: { miga: 'titulos.resumen' }, loadComponent: () => import('./resumen').then((m) => m.ResumenAccPage) },
    ],
  },
];
