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
    // Además de los de administración, los permisos de las pantallas del
    // funcionario (FT y DR): sin ellos, quien solo marca sus tareas o vota no
    // ve el ícono y no llega a /rrhh. Los tiles se filtran en SectionIndexPage.
    permisos: [
      'RRHH_DASHBOARD_VER', 'RRHH_FUNCIONARIO_VER',
      'RRHH_FT_MARCAR_PROPIAS', 'RRHH_FT_VERIFICAR',
      'RRHH_DR_REGISTRAR', 'RRHH_DR_PUNTUAR', 'RRHH_DR_VOTAR', 'RRHH_DR_MIS_DATOS', 'RRHH_DR_APROBAR',
    ],
  },
  {
    path: '/reportes',
    icon: 'assessment',
    label: 'Reportes',
    permisos: ['VENTAS_REPORTES_VER', 'FINANCIERO_REPORTES_VER'],
  },
  // El mozo entra con MUSICA_VER (mira que suena); cajero/gerente/admin
  // ademas controlan, porque tienen MUSICA_CONTROLAR.
  {
    path: '/musica',
    icon: 'music_note',
    label: 'Música',
    permisos: ['MUSICA_VER', 'MUSICA_CONTROLAR'],
  },
  // Configuracion: hoy solo Musica ambiente (gerente/admin). A futuro suma mas
  // opciones; el SectionIndexPage filtra los tiles por permiso.
  {
    path: '/configuracion',
    icon: 'settings',
    label: 'Configuración',
    permisos: ['MUSICA_CONFIGURAR'],
  },
];
