import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router, Routes } from '@angular/router';
import { AlmacenService } from './core/almacen.service';

const activarRegistro: CanActivateFn = (ruta: ActivatedRouteSnapshot) => {
  const almacen = inject(AlmacenService);
  const id = ruta.paramMap.get('id');
  if (id && almacen.registros().some((r) => r.id === id)) {
    almacen.activoId.set(id);
    return true;
  }
  return inject(Router).createUrlTree(['/']);
};

export const routes: Routes = [
  { path: '', title: 'Registros · Matriz ITA', loadComponent: () => import('./paginas/registros').then((m) => m.RegistrosPage) },
  {
    path: 'r/:id',
    canActivate: [activarRegistro],
    children: [
      { path: '', title: 'Diligenciar · Matriz ITA', loadComponent: () => import('./paginas/diligenciar').then((m) => m.DiligenciarPage) },
      { path: 'evidencias', title: 'Evidencias · Matriz ITA', loadComponent: () => import('./paginas/evidencias').then((m) => m.EvidenciasPage) },
      { path: 'resumen', title: 'Revisión y exportación · Matriz ITA', loadComponent: () => import('./paginas/resumen').then((m) => m.ResumenPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
