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
  { path: 'ingresar', title: 'titulos.ingresar', loadComponent: () => import('./paginas/ingresar').then((m) => m.IngresarPage) },
  {
    path: '',
    canActivate: [conSesion],
    children: [
      { path: '', title: 'titulos.registros', loadComponent: () => import('./paginas/registros').then((m) => m.RegistrosPage) },
      { path: 'mapa', title: 'titulos.mapa', loadComponent: () => import('./paginas/mapa').then((m) => m.MapaPage) },
      {
        path: 'usuarios',
        canActivate: [soloAdmin],
        title: 'titulos.usuarios',
        loadComponent: () => import('./paginas/usuarios').then((m) => m.UsuariosPage),
      },
      {
        path: 'r/:id',
        canActivate: [activarRegistro],
        children: [
          { path: '', title: 'titulos.diligenciar', loadComponent: () => import('./paginas/diligenciar').then((m) => m.DiligenciarPage) },
          { path: 'evidencias', title: 'titulos.evidencias', loadComponent: () => import('./paginas/evidencias').then((m) => m.EvidenciasPage) },
          { path: 'resumen', title: 'titulos.resumen', loadComponent: () => import('./paginas/resumen').then((m) => m.ResumenPage) },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
