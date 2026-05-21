/** Destinos de navegación de primer nivel (MVP administrativo). */
export interface NavItem {
  path: string;
  icon: string;
  label: string;
  /** routerLinkActive exact (para el destino raíz). */
  exact?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: 'home', label: 'Inicio', exact: true },
  { path: '/rrhh', icon: 'groups', label: 'RRHH' },
  { path: '/financiero', icon: 'payments', label: 'Finanzas' },
  { path: '/compras', icon: 'shopping_cart', label: 'Compras' },
  { path: '/productos', icon: 'inventory_2', label: 'Productos' },
];
