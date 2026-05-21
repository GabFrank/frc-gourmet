import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import type { SectionItem } from './pages/section-index/section-index.page';

/** Sub-módulos de RRHH (se van habilitando por ola). */
const RRHH_ITEMS: SectionItem[] = [
  { label: 'Cargos', icon: 'work', path: '/rrhh/cargos', enabled: true },
  { label: 'Turnos', icon: 'schedule', path: '/rrhh/turnos', enabled: true },
  { label: 'Motivos de vale', icon: 'label', path: '/rrhh/motivos-vale', enabled: true },
  { label: 'Feriados', icon: 'celebration', path: '/rrhh/feriados', enabled: true },
  { label: 'Funcionarios', icon: 'badge', path: '/rrhh/funcionarios', enabled: true },
  { label: 'Personas', icon: 'person', path: '/rrhh/personas', enabled: true },
  { label: 'Clientes', icon: 'business', path: '/rrhh/clientes', enabled: true },
  { label: 'Tipos de cliente', icon: 'loyalty', path: '/rrhh/tipos-cliente', enabled: true },
  { label: 'Usuarios', icon: 'account_circle', path: '/rrhh/usuarios', enabled: true },
  { label: 'Vales', icon: 'receipt_long', path: '/rrhh/vales', enabled: true },
  { label: 'Liquidaciones', icon: 'request_quote', path: '/rrhh/liquidaciones', enabled: true },
  { label: 'Penalizaciones', icon: 'gavel', path: '/rrhh/penalizaciones', enabled: true },
  { label: 'Bonos', icon: 'card_giftcard', path: '/rrhh/bonos', enabled: true },
  { label: 'Aguinaldos', icon: 'star', path: '/rrhh/aguinaldos', enabled: true },
];

/** Sub-módulos de Productos. */
const PRODUCTOS_ITEMS: SectionItem[] = [
  { label: 'Familias', icon: 'category', path: '/productos/familias', enabled: true },
  { label: 'Subfamilias', icon: 'account_tree', path: '/productos/subfamilias', enabled: true },
  { label: 'Adicionales', icon: 'add_circle', path: '/productos/adicionales', enabled: true },
  { label: 'Productos', icon: 'restaurant', path: '/productos/lista', enabled: false },
  { label: 'Recetas', icon: 'menu_book', path: '/productos/recetas', enabled: false },
  { label: 'Sabores', icon: 'auto_awesome', path: '/productos/sabores', enabled: false },
];

/** Sub-módulos de Compras. */
const COMPRAS_ITEMS: SectionItem[] = [
  { label: 'Compras', icon: 'shopping_cart', path: '/compras/lista', enabled: true },
  { label: 'Proveedores', icon: 'local_shipping', path: '/compras/proveedores', enabled: true },
  { label: 'Categorías de compra', icon: 'sell', path: '/compras/categorias', enabled: true },
  { label: 'Importaciones IA', icon: 'auto_awesome', path: '/compras/importaciones', enabled: false },
];

/** Sub-módulos de Financiero. */
const FINANCIERO_ITEMS: SectionItem[] = [
  { label: 'Cajas', icon: 'point_of_sale', path: '/financiero/cajas', enabled: true },
  { label: 'Cuentas por Cobrar', icon: 'request_quote', path: '/financiero/cxc', enabled: true },
  { label: 'Categorías de gasto', icon: 'sell', path: '/financiero/gasto-categorias', enabled: true },
  { label: 'Monedas', icon: 'monetization_on', path: '/financiero/monedas', enabled: false },
  { label: 'Caja Mayor', icon: 'account_balance', path: '/financiero/caja-mayor', enabled: false },
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
  {
    path: 'rrhh/personas/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/personas/persona-edit.page').then((m) => m.PersonaEditPage),
  },
  {
    path: 'rrhh/personas/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/personas/persona-edit.page').then((m) => m.PersonaEditPage),
  },
  {
    path: 'rrhh/tipos-cliente/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/tipos-cliente/tipo-cliente-edit.page').then((m) => m.TipoClienteEditPage),
  },
  {
    path: 'rrhh/tipos-cliente/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/tipos-cliente/tipo-cliente-edit.page').then((m) => m.TipoClienteEditPage),
  },
  {
    path: 'rrhh/clientes/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/clientes/cliente-edit.page').then((m) => m.ClienteEditPage),
  },
  {
    path: 'rrhh/clientes/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/clientes/cliente-edit.page').then((m) => m.ClienteEditPage),
  },
  {
    path: 'rrhh/usuarios/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/usuarios/usuario-edit.page').then((m) => m.UsuarioEditPage),
  },
  {
    path: 'rrhh/usuarios/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/usuarios/usuario-edit.page').then((m) => m.UsuarioEditPage),
  },
  {
    path: 'rrhh/funcionarios/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/funcionarios/funcionario-edit.page').then((m) => m.FuncionarioEditPage),
  },
  {
    path: 'rrhh/funcionarios/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/rrhh/funcionarios/funcionario-edit.page').then((m) => m.FuncionarioEditPage),
  },
  {
    path: 'productos/familias/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/familias/familia-edit.page').then((m) => m.FamiliaEditPage),
  },
  {
    path: 'productos/familias/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/familias/familia-edit.page').then((m) => m.FamiliaEditPage),
  },
  {
    path: 'productos/subfamilias/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/subfamilias/subfamilia-edit.page').then((m) => m.SubfamiliaEditPage),
  },
  {
    path: 'productos/subfamilias/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/subfamilias/subfamilia-edit.page').then((m) => m.SubfamiliaEditPage),
  },
  {
    path: 'productos/adicionales/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/adicionales/adicional-edit.page').then((m) => m.AdicionalEditPage),
  },
  {
    path: 'productos/adicionales/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/productos/adicionales/adicional-edit.page').then((m) => m.AdicionalEditPage),
  },
  {
    path: 'compras/categorias/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/compras/categorias/compra-categoria-edit.page').then((m) => m.CompraCategoriaEditPage),
  },
  {
    path: 'compras/categorias/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/compras/categorias/compra-categoria-edit.page').then((m) => m.CompraCategoriaEditPage),
  },
  {
    path: 'financiero/gasto-categorias/nuevo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categoria-edit.page').then((m) => m.GastoCategoriaEditPage),
  },
  {
    path: 'financiero/gasto-categorias/:id',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categoria-edit.page').then((m) => m.GastoCategoriaEditPage),
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
        path: 'rrhh/personas',
        data: { title: 'Personas' },
        loadComponent: () => import('./pages/rrhh/personas/personas-list.page').then((m) => m.PersonasListPage),
      },
      {
        path: 'rrhh/clientes',
        data: { title: 'Clientes' },
        loadComponent: () => import('./pages/rrhh/clientes/clientes-list.page').then((m) => m.ClientesListPage),
      },
      {
        path: 'rrhh/tipos-cliente',
        data: { title: 'Tipos de cliente' },
        loadComponent: () => import('./pages/rrhh/tipos-cliente/tipos-cliente-list.page').then((m) => m.TiposClienteListPage),
      },
      {
        path: 'rrhh/usuarios',
        data: { title: 'Usuarios' },
        loadComponent: () => import('./pages/rrhh/usuarios/usuarios-list.page').then((m) => m.UsuariosListPage),
      },
      {
        path: 'rrhh/funcionarios',
        data: { title: 'Funcionarios' },
        loadComponent: () => import('./pages/rrhh/funcionarios/funcionarios-list.page').then((m) => m.FuncionariosListPage),
      },
      {
        path: 'rrhh/vales',
        data: { title: 'Vales', source: 'vales' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/liquidaciones',
        data: { title: 'Liquidaciones', source: 'liquidaciones' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/penalizaciones',
        data: { title: 'Penalizaciones', source: 'penalizaciones' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/bonos',
        data: { title: 'Bonos', source: 'bonos' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/aguinaldos',
        data: { title: 'Aguinaldos', source: 'aguinaldos' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'financiero',
        pathMatch: 'full',
        data: { title: 'Financiero', items: FINANCIERO_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'financiero/gasto-categorias',
        data: { title: 'Categorías de gasto' },
        loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categorias-list.page').then((m) => m.GastoCategoriasListPage),
      },
      {
        path: 'financiero/cajas',
        data: { title: 'Cajas' },
        loadComponent: () => import('./pages/financiero/cajas/cajas-list.page').then((m) => m.CajasListPage),
      },
      {
        path: 'financiero/cxc',
        data: { title: 'Cuentas por Cobrar' },
        loadComponent: () => import('./pages/financiero/cxc/cxc-list.page').then((m) => m.CxcListPage),
      },
      {
        path: 'compras',
        pathMatch: 'full',
        data: { title: 'Compras', items: COMPRAS_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'compras/categorias',
        data: { title: 'Categorías de compra' },
        loadComponent: () => import('./pages/compras/categorias/compra-categorias-list.page').then((m) => m.CompraCategoriasListPage),
      },
      {
        path: 'compras/lista',
        data: { title: 'Compras' },
        loadComponent: () => import('./pages/compras/compras/compras-list.page').then((m) => m.ComprasListPage),
      },
      {
        path: 'compras/proveedores',
        data: { title: 'Proveedores' },
        loadComponent: () => import('./pages/compras/proveedores/proveedores-list.page').then((m) => m.ProveedoresListPage),
      },
      {
        path: 'productos',
        pathMatch: 'full',
        data: { title: 'Productos', items: PRODUCTOS_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'productos/familias',
        data: { title: 'Familias' },
        loadComponent: () => import('./pages/productos/familias/familias-list.page').then((m) => m.FamiliasListPage),
      },
      {
        path: 'productos/subfamilias',
        data: { title: 'Subfamilias' },
        loadComponent: () => import('./pages/productos/subfamilias/subfamilias-list.page').then((m) => m.SubfamiliasListPage),
      },
      {
        path: 'productos/adicionales',
        data: { title: 'Adicionales' },
        loadComponent: () => import('./pages/productos/adicionales/adicionales-list.page').then((m) => m.AdicionalesListPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
