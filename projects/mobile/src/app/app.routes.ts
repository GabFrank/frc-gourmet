import { Routes } from '@angular/router';

/**
 * Rutas de la PWA mobile. Navegación basada en Router (NO en el TabsService del
 * desktop). Todo lazy-loaded con componentes standalone.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  { path: '**', redirectTo: '' },
];
