/** Destinos de navegación de primer nivel (MVP administrativo). */
export interface NavItem {
  path: string;
  icon: string;
  label: string;
  /** routerLinkActive exact (para el destino raíz). */
  exact?: boolean;
  /**
   * Permisos requeridos para ver/abrir el destino. Si está presente, el usuario
   * debe tener AL MENOS UNO. Sin esta propiedad, el destino es público (todos
   * los logueados lo ven: ej. Inicio, Ventas, Productos).
   */
  permisos?: string[];
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'home', label: 'Inicio', exact: true },
  { path: '/ventas', icon: 'restaurant', label: 'Ventas' },
  { path: '/productos', icon: 'inventory_2', label: 'Productos' },
  {
    path: '/compras',
    icon: 'shopping_cart',
    label: 'Compras',
    permisos: ['COMPRAS_DASHBOARD_VER', 'COMPRAS_VER', 'COMPRAS_GESTIONAR'],
  },
  {
    path: '/financiero',
    icon: 'payments',
    label: 'Finanzas',
    permisos: ['FINANCIERO_DASHBOARD_VER', 'FINANCIERO_CAJA_VER', 'FINANCIERO_CAJA_GESTIONAR'],
  },
  {
    path: '/rrhh',
    icon: 'groups',
    label: 'RRHH',
    permisos: ['RRHH_DASHBOARD_VER', 'RRHH_FUNCIONARIO_VER'],
  },
];
