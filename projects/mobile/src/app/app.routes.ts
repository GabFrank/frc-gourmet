import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import type { SectionItem } from './pages/section-index/section-index.page';

/** Sub-módulos de RRHH (se van habilitando por ola). */
const RRHH_ITEMS: SectionItem[] = [
  { label: 'Cargos', icon: 'work', path: '/rrhh/cargos', enabled: true },
  { label: 'Turnos', icon: 'schedule', path: '/rrhh/turnos', enabled: true },
  { label: 'Motivos de vale', icon: 'label', path: '/rrhh/motivos-vale', enabled: true },
  { label: 'Feriados', icon: 'celebration', path: '/rrhh/feriados', enabled: true },
  { label: 'Funcionarios', icon: 'badge', path: '/rrhh/funcionarios', enabled: false },
  { label: 'Personas', icon: 'person', path: '/rrhh/personas', enabled: false },
  { label: 'Usuarios', icon: 'account_circle', path: '/rrhh/usuarios', enabled: false },
  { label: 'Vales', icon: 'receipt_long', path: '/rrhh/vales', enabled: false },
  { label: 'Liquidaciones', icon: 'request_quote', path: '/rrhh/liquidaciones', enabled: false },
];

/**
 * Rutas de la PWA mobile. Navegación con Router (no TabsService).
 * - Formularios full-screen (alta/edición) → rutas top-level, ANTES del shell.
 * - Listados/índices → hijos del ShellComponent (con bottom-nav / nav-rail).
 * Las olas administrativas van habilitando sub-módulos.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },

  // --- Formularios full-screen (fuera del shell) ---
  {
    path: 'rrhh/cargos/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/cargos/cargo-edit.page').then((m) => m.CargoEditPage),
  },
  {
    path: 'rrhh/cargos/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/cargos/cargo-edit.page').then((m) => m.CargoEditPage),
  },
  {
    path: 'rrhh/turnos/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/turnos/turno-edit.page').then((m) => m.TurnoEditPage),
  },
  {
    path: 'rrhh/turnos/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/turnos/turno-edit.page').then((m) => m.TurnoEditPage),
  },
  {
    path: 'rrhh/motivos-vale/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/motivos-vale/motivo-vale-edit.page').then((m) => m.MotivoValeEditPage),
  },
  {
    path: 'rrhh/motivos-vale/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/motivos-vale/motivo-vale-edit.page').then((m) => m.MotivoValeEditPage),
  },
  {
    path: 'rrhh/feriados/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/feriados/feriado-edit.page').then((m) => m.FeriadoEditPage),
  },
  {
    path: 'rrhh/feriados/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/feriados/feriado-edit.page').then((m) => m.FeriadoEditPage),
  },

  // --- Shell autenticado (listados / índices) ---
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
        pathMatch: 'full',
        data: { title: 'Recursos Humanos', items: RRHH_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'rrhh/cargos',
        data: { title: 'Cargos' },
        loadComponent: () => import('./pages/rrhh/cargos/cargos-list.page').then((m) => m.CargosListPage),
      },
      {
        path: 'rrhh/turnos',
        data: { title: 'Turnos' },
        loadComponent: () => import('./pages/rrhh/turnos/turnos-list.page').then((m) => m.TurnosListPage),
      },
      {
        path: 'rrhh/motivos-vale',
        data: { title: 'Motivos de vale' },
        loadComponent: () => import('./pages/rrhh/motivos-vale/motivos-vale-list.page').then((m) => m.MotivosValeListPage),
      },
      {
        path: 'rrhh/feriados',
        data: { title: 'Feriados' },
        loadComponent: () => import('./pages/rrhh/feriados/feriados-list.page').then((m) => m.FeriadosListPage),
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
