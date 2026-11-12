import { Routes } from '@angular/router';
import { conFormato, conSesion, soloAdmin } from './core/guardias';

export const routes: Routes = [
  { path: 'ingresar', title: 'titulos.ingresar', loadComponent: () => import('./paginas/ingresar').then((m) => m.IngresarPage) },
  {
    path: '',
    canActivate: [conSesion],
    children: [
      { path: '', title: 'titulos.panel', loadComponent: () => import('./paginas/panel').then((m) => m.PanelPage) },
      { path: 'mapa', title: 'titulos.mapa', loadComponent: () => import('./paginas/mapa').then((m) => m.MapaPage) },
      {
        path: 'usuarios',
        canActivate: [soloAdmin],
        title: 'titulos.usuarios',
        loadComponent: () => import('./paginas/usuarios').then((m) => m.UsuariosPage),
      },
      { path: 'ita', canActivate: [conFormato('ita')], loadChildren: () => import('./formatos/ita/ita.routes').then((m) => m.rutasIta) },
      // Enlaces guardados de antes de que hubiera varios formatos.
      { path: 'r/:id', redirectTo: 'ita/r/:id' },
      { path: 'r/:id/evidencias', redirectTo: 'ita/r/:id/evidencias' },
      { path: 'r/:id/resumen', redirectTo: 'ita/r/:id/resumen' },
    ],
  },
  { path: '**', redirectTo: '' },
];
