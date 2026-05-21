import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

/**
 * Rutas de la PWA mobile. Navegación basada en Router (NO en el TabsService del
 * desktop). El `ShellComponent` es el layout autenticado; las secciones cuelgan
 * como hijos. Las olas administrativas van reemplazando los PlaceholderPage.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        data: { title: 'Inicio' },
        loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'rrhh',
        data: { title: 'Recursos Humanos', icon: 'groups' },
        loadComponent: () => import('./pages/placeholder/placeholder.page').then((m) => m.PlaceholderPage),
      },
      {
        path: 'financiero',
        data: { title: 'Financiero', icon: 'payments' },
        loadComponent: () => import('./pages/placeholder/placeholder.page').then((m) => m.PlaceholderPage),
      },
      {
        path: 'compras',
        data: { title: 'Compras', icon: 'shopping_cart' },
        loadComponent: () => import('./pages/placeholder/placeholder.page').then((m) => m.PlaceholderPage),
      },
      {
        path: 'productos',
        data: { title: 'Productos', icon: 'inventory_2' },
        loadComponent: () => import('./pages/placeholder/placeholder.page').then((m) => m.PlaceholderPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
