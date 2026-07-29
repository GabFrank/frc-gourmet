import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permisoGuard } from './core/guards/permiso.guard';
import type { SectionItem } from './pages/section-index/section-index.page';

/** Sub-módulos de RRHH (se van habilitando por ola). */
const RRHH_ITEMS: SectionItem[] = [
  { label: 'Cargos', icon: 'work', path: '/rrhh/cargos', enabled: true, permiso: 'RRHH_CONFIG_EDITAR' },
  { label: 'Turnos', icon: 'schedule', path: '/rrhh/turnos', enabled: true, permiso: 'RRHH_CONFIG_EDITAR' },
  { label: 'Motivos de vale', icon: 'label', path: '/rrhh/motivos-vale', enabled: true, permiso: 'RRHH_CONFIG_EDITAR' },
  { label: 'Feriados', icon: 'celebration', path: '/rrhh/feriados', enabled: true, permiso: 'RRHH_CONFIG_EDITAR' },
  { label: 'Funcionarios', icon: 'badge', path: '/rrhh/funcionarios', enabled: true, permiso: 'RRHH_FUNCIONARIO_VER' },
  { label: 'Personas', icon: 'person', path: '/rrhh/personas', enabled: true, permiso: 'PERSONAS_VER' },
  { label: 'Clientes', icon: 'business', path: '/rrhh/clientes', enabled: true, permiso: 'CLIENTES_VER' },
  { label: 'Tipos de cliente', icon: 'loyalty', path: '/rrhh/tipos-cliente', enabled: true, permiso: 'CLIENTES_VER' },
  { label: 'Usuarios', icon: 'account_circle', path: '/rrhh/usuarios', enabled: true, permiso: 'USUARIOS_GESTIONAR' },
  { label: 'Vales', icon: 'receipt_long', path: '/rrhh/vales', enabled: true, permiso: 'RRHH_VALE_CREAR' },
  { label: 'Liquidaciones', icon: 'request_quote', path: '/rrhh/liquidaciones', enabled: true, permiso: 'RRHH_LIQUIDACION_GENERAR' },
  { label: 'Penalizaciones', icon: 'gavel', path: '/rrhh/penalizaciones', enabled: true, permiso: 'RRHH_PENALIZACION_REGISTRAR' },
  { label: 'Bonos', icon: 'card_giftcard', path: '/rrhh/bonos', enabled: true, permiso: 'RRHH_BONO_OTORGAR' },
  { label: 'Aguinaldos', icon: 'star', path: '/rrhh/aguinaldos', enabled: true, permiso: 'RRHH_LIQUIDACION_GENERAR' },
  { label: 'Asistencias', icon: 'fact_check', path: '/rrhh/asistencias', enabled: true, permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
  { label: 'Marcar Asistencia', icon: 'how_to_reg', path: '/rrhh/fichaje', enabled: true, permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
  { label: 'Configuración RRHH', icon: 'tune', path: '/rrhh/configuracion', enabled: true, permiso: 'RRHH_CONFIG_EDITAR' },
  { label: 'Horas extra', icon: 'more_time', path: '/rrhh/horas-extra', enabled: true, permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
  { label: 'Permisos', icon: 'verified_user', path: '/rrhh/permisos', enabled: true, permiso: 'SISTEMA_PERMISO_GESTIONAR' },
  { label: 'Notificaciones', icon: 'notifications', path: '/rrhh/notificaciones', enabled: true, permiso: 'RRHH_NOTIFICACIONES_VER' },
];

/** Sub-módulos de Productos. */
const PRODUCTOS_ITEMS: SectionItem[] = [
  { label: 'Familias', icon: 'category', path: '/productos/familias', enabled: true, permiso: 'CATEGORIAS_GESTIONAR' },
  { label: 'Subfamilias', icon: 'account_tree', path: '/productos/subfamilias', enabled: true, permiso: 'CATEGORIAS_GESTIONAR' },
  { label: 'Adicionales', icon: 'add_circle', path: '/productos/adicionales', enabled: true, permiso: 'ADICIONALES_VER' },
  { label: 'Productos', icon: 'restaurant', path: '/productos/lista', enabled: true, permiso: 'PRODUCTOS_VER' },
  { label: 'Recetas', icon: 'menu_book', path: '/productos/recetas', enabled: true, permiso: 'RECETAS_VER' },
  { label: 'Sabores', icon: 'auto_awesome', path: '/productos/sabores', enabled: false, permiso: 'SABORES_VER' },
];

/** Sub-módulos de Compras. */
const COMPRAS_ITEMS: SectionItem[] = [
  { label: 'Compras', icon: 'shopping_cart', path: '/compras/lista', enabled: true, permiso: 'COMPRAS_VER' },
  { label: 'Proveedores', icon: 'local_shipping', path: '/compras/proveedores', enabled: true, permiso: 'PROVEEDORES_VER' },
  { label: 'Categorías de compra', icon: 'sell', path: '/compras/categorias', enabled: true, permiso: 'COMPRAS_GESTIONAR' },
  { label: 'Importaciones IA', icon: 'auto_awesome', path: '/compras/importaciones', enabled: false, permiso: 'COMPRAS_IMPORTAR_FACTURA' },
];

/** Sub-módulos de Financiero. */
const FINANCIERO_ITEMS: SectionItem[] = [
  { label: 'Cajas', icon: 'point_of_sale', path: '/financiero/cajas', enabled: true, permiso: 'FINANCIERO_CAJA_VER' },
  { label: 'Cuentas por Cobrar', icon: 'request_quote', path: '/financiero/cxc', enabled: true, permiso: 'CPC_COBRAR' },
  { label: 'Cuentas por Pagar', icon: 'payments', path: '/financiero/cxp', enabled: true, permiso: 'COMPRAS_GESTIONAR' },
  { label: 'Gastos', icon: 'receipt_long', path: '/financiero/gastos', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Categorías de gasto', icon: 'sell', path: '/financiero/gasto-categorias', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Operaciones financieras', icon: 'swap_horiz', path: '/financiero/operaciones-financieras', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Cat. de entrada varia', icon: 'sell', path: '/financiero/entrada-varia-categorias', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Cat. de operación financiera', icon: 'sell', path: '/financiero/operacion-financiera-categorias', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Monedas', icon: 'monetization_on', path: '/financiero/monedas', enabled: false, permiso: 'MONEDAS_GESTIONAR' },
  { label: 'Caja Mayor', icon: 'account_balance', path: '/financiero/caja-mayor', enabled: true, permiso: 'CAJA_MAYOR_OPERAR' },
  { label: 'Cuentas bancarias', icon: 'savings', path: '/financiero/cuentas-bancarias', enabled: true, permiso: 'BANCOS_VER' },
  { label: 'Reglas de comisión', icon: 'percent', path: '/financiero/comisiones-reglas', enabled: true, permiso: 'COMISION_REGLA_VER' },
  { label: 'Equipos de comisión', icon: 'groups', path: '/financiero/comisiones-equipos', enabled: true, permiso: 'COMISION_EQUIPO_GESTIONAR' },
  { label: 'Liq. de comisión', icon: 'receipt', path: '/financiero/comisiones-liquidaciones', enabled: true, permiso: 'COMISION_LIQUIDACION_GENERAR' },
];

/** Sub-módulos de Ventas (módulo meseros). */
const VENTAS_ITEMS: SectionItem[] = [
  { label: 'Mesas', icon: 'table_restaurant', path: '/ventas/mesas', enabled: true, permiso: 'VENTAS_PDV' },
  { label: 'Resumen', icon: 'insights', path: '/ventas/resumen', enabled: true, permiso: 'VENTAS_HISTORICO_VER' },
];

/** Reportes de cierre de mes. */
const REPORTES_ITEMS: SectionItem[] = [
  { label: 'Reportes de Ventas', icon: 'trending_up', path: '/reportes/ventas', enabled: true, permiso: 'VENTAS_REPORTES_VER' },
  { label: 'Reportes Financieros', icon: 'account_balance_wallet', path: '/reportes/finanzas', enabled: true, permiso: 'FINANCIERO_REPORTES_VER' },
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
  // Login por QR — lado del dispositivo (TV/desktop): público, aún sin sesión.
  {
    path: 'vincular-dispositivo',
    loadComponent: () => import('./pages/vincular-dispositivo/vincular-dispositivo.page').then((m) => m.VincularDispositivoPage),
  },
  // Login por QR — lado del que autoriza (teléfono ya logueado).
  {
    path: 'aprobar-dispositivo',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/aprobar-dispositivo/aprobar-dispositivo.page').then((m) => m.AprobarDispositivoPage),
  },
  // Cambio de contraseña temporal obligatorio (full-screen, con sesión). El
  // authGuard redirige acá mientras el usuario tenga mustChangePassword=true.
  {
    path: 'cambiar-password',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/cambiar-password/cambiar-password.page').then((m) => m.CambiarPasswordPage),
  },

  // KDS (pantalla de cocina) para TV — full-screen, fuera del shell. El TV se
  // loguea una vez (usuario de servicio con permiso de ver KDS) y queda andando.
  {
    path: 'kds',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/kds/kds.page').then((m) => m.KdsPage),
  },

  // Subida por QR — pública (sin authGuard): el token de sesión en la query es
  // la credencial. Se abre al escanear el QR del desktop (`/upload?session=<id>`).
  {
    path: 'upload',
    loadComponent: () => import('./pages/upload/qr-upload.page').then((m) => m.QrUploadPage),
  },

  // --- Formularios full-screen (fuera del shell) ---
  {
    path: 'ventas/mesas/:id/pedido',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/tomar-pedido.page').then((m) => m.TomarPedidoPage),
  },
  {
    path: 'ventas/mesas/:id/cliente',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/cliente-mesa.page').then((m) => m.ClienteMesaPage),
  },
  {
    path: 'ventas/mesas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/mesa-detalle.page').then((m) => m.MesaDetallePage),
  },
  // --- Comandas (reúsan los mismos componentes con contexto = 'comanda') ---
  {
    path: 'ventas/comandas/:id/pedido',
    canActivate: [authGuard, permisoGuard],
    data: { contexto: 'comanda', permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/tomar-pedido.page').then((m) => m.TomarPedidoPage),
  },
  {
    path: 'ventas/comandas/:id/cliente',
    canActivate: [authGuard, permisoGuard],
    data: { contexto: 'comanda', permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/cliente-mesa.page').then((m) => m.ClienteMesaPage),
  },
  {
    path: 'ventas/comandas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { contexto: 'comanda', permiso: 'VENTAS_PDV' },
    loadComponent: () => import('./pages/ventas/mesas/mesa-detalle.page').then((m) => m.MesaDetallePage),
  },
  {
    path: 'rrhh/cargos/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/cargos/cargo-edit.page').then((m) => m.CargoEditPage),
  },
  {
    path: 'rrhh/cargos/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/cargos/cargo-edit.page').then((m) => m.CargoEditPage),
  },
  {
    path: 'rrhh/turnos/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/turnos/turno-edit.page').then((m) => m.TurnoEditPage),
  },
  {
    path: 'rrhh/turnos/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/turnos/turno-edit.page').then((m) => m.TurnoEditPage),
  },
  {
    path: 'rrhh/motivos-vale/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/motivos-vale/motivo-vale-edit.page').then((m) => m.MotivoValeEditPage),
  },
  {
    path: 'rrhh/motivos-vale/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/motivos-vale/motivo-vale-edit.page').then((m) => m.MotivoValeEditPage),
  },
  {
    path: 'rrhh/feriados/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/feriados/feriado-edit.page').then((m) => m.FeriadoEditPage),
  },
  {
    path: 'rrhh/feriados/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_CONFIG_EDITAR' },
    loadComponent: () => import('./pages/rrhh/feriados/feriado-edit.page').then((m) => m.FeriadoEditPage),
  },
  {
    path: 'rrhh/personas/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'PERSONAS_VER' },
    loadComponent: () => import('./pages/rrhh/personas/persona-edit.page').then((m) => m.PersonaEditPage),
  },
  {
    path: 'rrhh/personas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'PERSONAS_VER' },
    loadComponent: () => import('./pages/rrhh/personas/persona-edit.page').then((m) => m.PersonaEditPage),
  },
  {
    path: 'rrhh/tipos-cliente/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CLIENTES_VER' },
    loadComponent: () => import('./pages/rrhh/tipos-cliente/tipo-cliente-edit.page').then((m) => m.TipoClienteEditPage),
  },
  {
    path: 'rrhh/tipos-cliente/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CLIENTES_VER' },
    loadComponent: () => import('./pages/rrhh/tipos-cliente/tipo-cliente-edit.page').then((m) => m.TipoClienteEditPage),
  },
  {
    path: 'rrhh/clientes/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CLIENTES_VER' },
    loadComponent: () => import('./pages/rrhh/clientes/cliente-edit.page').then((m) => m.ClienteEditPage),
  },
  {
    path: 'rrhh/clientes/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CLIENTES_VER' },
    loadComponent: () => import('./pages/rrhh/clientes/cliente-edit.page').then((m) => m.ClienteEditPage),
  },
  {
    path: 'rrhh/usuarios/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'USUARIOS_GESTIONAR' },
    loadComponent: () => import('./pages/rrhh/usuarios/usuario-edit.page').then((m) => m.UsuarioEditPage),
  },
  {
    path: 'rrhh/usuarios/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'USUARIOS_GESTIONAR' },
    loadComponent: () => import('./pages/rrhh/usuarios/usuario-edit.page').then((m) => m.UsuarioEditPage),
  },
  {
    path: 'rrhh/funcionarios/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_FUNCIONARIO_VER' },
    loadComponent: () => import('./pages/rrhh/funcionarios/funcionario-edit.page').then((m) => m.FuncionarioEditPage),
  },
  {
    path: 'rrhh/funcionarios/:id/rostros',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_FUNCIONARIO_VER' },
    loadComponent: () => import('./pages/rrhh/funcionarios/enrolar-rostro.page').then((m) => m.EnrolarRostroPage),
  },
  {
    path: 'rrhh/funcionarios/:id/detalle',
    canActivate: [authGuard, permisoGuard],
    data: { title: 'Funcionario', permiso: 'RRHH_FUNCIONARIO_VER' },
    loadComponent: () => import('./pages/rrhh/funcionarios/funcionario-detalle.page').then((m) => m.FuncionarioDetallePage),
  },
  {
    path: 'rrhh/fichaje',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
    loadComponent: () => import('./pages/rrhh/fichaje/fichaje-facial.page').then((m) => m.FichajeFacialPage),
  },
  {
    path: 'rrhh/funcionarios/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RRHH_FUNCIONARIO_VER' },
    loadComponent: () => import('./pages/rrhh/funcionarios/funcionario-edit.page').then((m) => m.FuncionarioEditPage),
  },
  {
    path: 'productos/familias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CATEGORIAS_GESTIONAR' },
    loadComponent: () => import('./pages/productos/familias/familia-edit.page').then((m) => m.FamiliaEditPage),
  },
  {
    path: 'productos/familias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CATEGORIAS_GESTIONAR' },
    loadComponent: () => import('./pages/productos/familias/familia-edit.page').then((m) => m.FamiliaEditPage),
  },
  {
    path: 'productos/subfamilias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CATEGORIAS_GESTIONAR' },
    loadComponent: () => import('./pages/productos/subfamilias/subfamilia-edit.page').then((m) => m.SubfamiliaEditPage),
  },
  {
    path: 'productos/subfamilias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CATEGORIAS_GESTIONAR' },
    loadComponent: () => import('./pages/productos/subfamilias/subfamilia-edit.page').then((m) => m.SubfamiliaEditPage),
  },
  {
    path: 'productos/adicionales/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'ADICIONALES_VER' },
    loadComponent: () => import('./pages/productos/adicionales/adicional-edit.page').then((m) => m.AdicionalEditPage),
  },
  {
    path: 'productos/adicionales/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'ADICIONALES_VER' },
    loadComponent: () => import('./pages/productos/adicionales/adicional-edit.page').then((m) => m.AdicionalEditPage),
  },
  // Alta/edición de producto full-screen ('nuevo'/'editar' antes de 'detalle/:id').
  {
    path: 'productos/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'PRODUCTOS_VER' },
    loadComponent: () => import('./pages/productos/productos/producto-edit.page').then((m) => m.ProductoEditPage),
  },
  {
    path: 'productos/editar/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'PRODUCTOS_VER' },
    loadComponent: () => import('./pages/productos/productos/producto-edit.page').then((m) => m.ProductoEditPage),
  },
  {
    path: 'productos/detalle/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'PRODUCTOS_VER' },
    loadComponent: () => import('./pages/productos/productos/producto-detalle.page').then((m) => m.ProductoDetallePage),
  },
  // Recetas: alta/edición full-screen ('nuevo' antes de ':id').
  {
    path: 'productos/recetas/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RECETAS_VER' },
    loadComponent: () => import('./pages/productos/recetas/receta-edit.page').then((m) => m.RecetaEditPage),
  },
  {
    path: 'productos/recetas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'RECETAS_VER' },
    loadComponent: () => import('./pages/productos/recetas/receta-edit.page').then((m) => m.RecetaEditPage),
  },
  {
    path: 'compras/categorias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'COMPRAS_GESTIONAR' },
    loadComponent: () => import('./pages/compras/categorias/compra-categoria-edit.page').then((m) => m.CompraCategoriaEditPage),
  },
  {
    path: 'compras/categorias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'COMPRAS_GESTIONAR' },
    loadComponent: () => import('./pages/compras/categorias/compra-categoria-edit.page').then((m) => m.CompraCategoriaEditPage),
  },
  {
    path: 'financiero/gasto-categorias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categoria-edit.page').then((m) => m.GastoCategoriaEditPage),
  },
  {
    path: 'financiero/gasto-categorias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categoria-edit.page').then((m) => m.GastoCategoriaEditPage),
  },
  {
    path: 'financiero/entrada-varia-categorias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/entrada-varia-categorias/entrada-varia-categoria-edit.page').then((m) => m.EntradaVariaCategoriaEditPage),
  },
  {
    path: 'financiero/entrada-varia-categorias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/entrada-varia-categorias/entrada-varia-categoria-edit.page').then((m) => m.EntradaVariaCategoriaEditPage),
  },
  {
    path: 'financiero/operacion-financiera-categorias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/operacion-financiera-categorias/operacion-financiera-categoria-edit.page').then((m) => m.OperacionFinancieraCategoriaEditPage),
  },
  {
    path: 'financiero/operacion-financiera-categorias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/operacion-financiera-categorias/operacion-financiera-categoria-edit.page').then((m) => m.OperacionFinancieraCategoriaEditPage),
  },
  // Caja Mayor: alta ('nueva') y edición de datos ('editar/:id') full-screen.
  // Declaradas antes del shell y antes de 'financiero/caja-mayor/:id' (detalle).
  {
    path: 'financiero/caja-mayor/nueva',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/caja-mayor-edit.page').then((m) => m.CajaMayorEditPage),
  },
  {
    path: 'financiero/caja-mayor/editar/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/caja-mayor-edit.page').then((m) => m.CajaMayorEditPage),
  },
  {
    path: 'financiero/caja-mayor/configurar/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/configurar-caja-mayor.page').then((m) => m.ConfigurarCajaMayorPage),
  },
  // Operaciones de Caja Mayor (formularios full-screen). Rutas más profundas que
  // el detalle (financiero/caja-mayor/:id), declaradas antes del shell.
  {
    path: 'financiero/caja-mayor/:id/gasto',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage),
  },
  {
    path: 'financiero/gastos/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage),
  },
  {
    path: 'financiero/gastos/:gastoId/editar',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/gasto-form.page').then((m) => m.GastoFormPage),
  },
  {
    path: 'financiero/caja-mayor/:id/entrada-varia',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/entrada-varia-nuevo.page').then((m) => m.EntradaVariaNuevoPage),
  },
  {
    path: 'financiero/caja-mayor/:id/ajuste/:signo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/ajuste-nuevo.page').then((m) => m.AjusteNuevoPage),
  },
  {
    path: 'financiero/caja-mayor/:id/vale',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/vale-nuevo.page').then((m) => m.ValeNuevoPage),
  },
  {
    path: 'financiero/caja-mayor/:id/pagar-compras',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/pagar-compras.page').then((m) => m.PagarComprasPage),
  },
  {
    path: 'financiero/caja-mayor/:id/ingresar-retiro',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/ingresar-retiro.page').then((m) => m.IngresarRetiroPage),
  },
  {
    path: 'financiero/caja-mayor/:id/operacion',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/operacion-financiera-nuevo.page').then((m) => m.OperacionFinancieraNuevoPage),
  },
  {
    path: 'financiero/operaciones-financieras/nueva',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CAJA_MAYOR_OPERAR' },
    loadComponent: () => import('./pages/financiero/caja-mayor/ops/operacion-financiera-nuevo.page').then((m) => m.OperacionFinancieraNuevoPage),
  },
  // Cajas: apertura, detalle/resumen y cierre (full-screen). 'abrir' debe ir
  // ANTES de ':id' para no matchearse como un id.
  {
    path: 'financiero/cajas/abrir',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'FINANCIERO_CAJA_VER' },
    loadComponent: () => import('./pages/financiero/cajas/caja-abrir.page').then((m) => m.CajaAbrirPage),
  },
  {
    path: 'financiero/cajas/:id/cerrar',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'FINANCIERO_CAJA_VER' },
    loadComponent: () => import('./pages/financiero/cajas/caja-cerrar.page').then((m) => m.CajaCerrarPage),
  },
  {
    path: 'financiero/cajas/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'FINANCIERO_CAJA_VER' },
    loadComponent: () => import('./pages/financiero/cajas/caja-detalle.page').then((m) => m.CajaDetallePage),
  },
  // Cuentas bancarias: alta ('nuevo' antes de ':id'), movimientos y edición (full-screen).
  {
    path: 'financiero/cuentas-bancarias/nuevo',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'BANCOS_VER' },
    loadComponent: () => import('./pages/financiero/cuentas-bancarias/cuenta-bancaria-edit.page').then((m) => m.CuentaBancariaEditPage),
  },
  {
    path: 'financiero/cuentas-bancarias/:id/movimientos',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'BANCOS_VER' },
    loadComponent: () => import('./pages/financiero/cuentas-bancarias/movimientos-cuenta.page').then((m) => m.MovimientosCuentaPage),
  },
  {
    path: 'financiero/cuentas-bancarias/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'BANCOS_VER' },
    loadComponent: () => import('./pages/financiero/cuentas-bancarias/cuenta-bancaria-edit.page').then((m) => m.CuentaBancariaEditPage),
  },
  // Detalles de cuentas corrientes (full-screen: cabecera + cuotas + pagar/cobrar).
  {
    path: 'financiero/cxp/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'COMPRAS_GESTIONAR' },
    loadComponent: () => import('./pages/financiero/cxp/cxp-detalle.page').then((m) => m.CxpDetallePage),
  },
  {
    path: 'financiero/cxc/:id',
    canActivate: [authGuard, permisoGuard],
    data: { permiso: 'CPC_COBRAR' },
    loadComponent: () => import('./pages/financiero/cxc/cxc-detalle.page').then((m) => m.CxcDetallePage),
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
        canActivate: [permisoGuard],
        data: { title: 'Cargos', permiso: 'RRHH_CONFIG_EDITAR' },
        loadComponent: () => import('./pages/rrhh/cargos/cargos-list.page').then((m) => m.CargosListPage),
      },
      {
        path: 'rrhh/turnos',
        canActivate: [permisoGuard],
        data: { title: 'Turnos', permiso: 'RRHH_CONFIG_EDITAR' },
        loadComponent: () => import('./pages/rrhh/turnos/turnos-list.page').then((m) => m.TurnosListPage),
      },
      {
        path: 'rrhh/motivos-vale',
        canActivate: [permisoGuard],
        data: { title: 'Motivos de vale', permiso: 'RRHH_CONFIG_EDITAR' },
        loadComponent: () => import('./pages/rrhh/motivos-vale/motivos-vale-list.page').then((m) => m.MotivosValeListPage),
      },
      {
        path: 'rrhh/feriados',
        canActivate: [permisoGuard],
        data: { title: 'Feriados', permiso: 'RRHH_CONFIG_EDITAR' },
        loadComponent: () => import('./pages/rrhh/feriados/feriados-list.page').then((m) => m.FeriadosListPage),
      },
      {
        path: 'rrhh/configuracion',
        canActivate: [permisoGuard],
        data: { title: 'Configuración RRHH', permiso: 'RRHH_CONFIG_EDITAR' },
        loadComponent: () => import('./pages/rrhh/configuracion/configuracion-rrhh.page').then((m) => m.ConfiguracionRrhhPage),
      },
      {
        path: 'rrhh/personas',
        canActivate: [permisoGuard],
        data: { title: 'Personas', permiso: 'PERSONAS_VER' },
        loadComponent: () => import('./pages/rrhh/personas/personas-list.page').then((m) => m.PersonasListPage),
      },
      {
        path: 'rrhh/clientes',
        canActivate: [permisoGuard],
        data: { title: 'Clientes', permiso: 'CLIENTES_VER' },
        loadComponent: () => import('./pages/rrhh/clientes/clientes-list.page').then((m) => m.ClientesListPage),
      },
      {
        path: 'rrhh/tipos-cliente',
        canActivate: [permisoGuard],
        data: { title: 'Tipos de cliente', permiso: 'CLIENTES_VER' },
        loadComponent: () => import('./pages/rrhh/tipos-cliente/tipos-cliente-list.page').then((m) => m.TiposClienteListPage),
      },
      {
        path: 'rrhh/usuarios',
        canActivate: [permisoGuard],
        data: { title: 'Usuarios', permiso: 'USUARIOS_GESTIONAR' },
        loadComponent: () => import('./pages/rrhh/usuarios/usuarios-list.page').then((m) => m.UsuariosListPage),
      },
      {
        path: 'rrhh/funcionarios',
        canActivate: [permisoGuard],
        data: { title: 'Funcionarios', permiso: 'RRHH_FUNCIONARIO_VER' },
        loadComponent: () => import('./pages/rrhh/funcionarios/funcionarios-list.page').then((m) => m.FuncionariosListPage),
      },
      {
        path: 'rrhh/vales',
        canActivate: [permisoGuard],
        data: { title: 'Vales', permiso: 'RRHH_VALE_CREAR' },
        loadComponent: () => import('./pages/rrhh/vales/vales-list.page').then((m) => m.ValesListPage),
      },
      {
        path: 'rrhh/liquidaciones',
        canActivate: [permisoGuard],
        data: { title: 'Liquidaciones', source: 'liquidaciones', permiso: 'RRHH_LIQUIDACION_GENERAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/penalizaciones',
        canActivate: [permisoGuard],
        data: { title: 'Penalizaciones', source: 'penalizaciones', permiso: 'RRHH_PENALIZACION_REGISTRAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/bonos',
        canActivate: [permisoGuard],
        data: { title: 'Bonos', source: 'bonos', permiso: 'RRHH_BONO_OTORGAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/aguinaldos',
        canActivate: [permisoGuard],
        data: { title: 'Aguinaldos', source: 'aguinaldos', permiso: 'RRHH_LIQUIDACION_GENERAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/asistencias',
        canActivate: [permisoGuard],
        data: { title: 'Asistencias', source: 'asistencias', permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/horas-extra',
        canActivate: [permisoGuard],
        data: { title: 'Horas extra', source: 'horas-extra', permiso: 'RRHH_ASISTENCIA_REGISTRAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'rrhh/permisos',
        canActivate: [permisoGuard],
        data: { title: 'Permisos', permiso: 'SISTEMA_PERMISO_GESTIONAR' },
        loadComponent: () => import('./pages/rrhh/permisos/permisos-list.page').then((m) => m.PermisosListPage),
      },
      {
        path: 'rrhh/notificaciones',
        canActivate: [permisoGuard],
        data: { title: 'Notificaciones', permiso: 'RRHH_NOTIFICACIONES_VER' },
        loadComponent: () => import('./pages/rrhh/notificaciones/notificaciones-list.page').then((m) => m.NotificacionesListPage),
      },
      {
        path: 'financiero',
        pathMatch: 'full',
        data: { title: 'Financiero', items: FINANCIERO_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'financiero/gasto-categorias',
        canActivate: [permisoGuard],
        data: { title: 'Categorías de gasto', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/gasto-categorias/gasto-categorias-list.page').then((m) => m.GastoCategoriasListPage),
      },
      {
        path: 'financiero/entrada-varia-categorias',
        canActivate: [permisoGuard],
        data: { title: 'Cat. de entrada varia', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/entrada-varia-categorias/entrada-varia-categorias-list.page').then((m) => m.EntradaVariaCategoriasListPage),
      },
      {
        path: 'financiero/operacion-financiera-categorias',
        canActivate: [permisoGuard],
        data: { title: 'Cat. de operación financiera', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/operacion-financiera-categorias/operacion-financiera-categorias-list.page').then((m) => m.OperacionFinancieraCategoriasListPage),
      },
      {
        path: 'financiero/operaciones-financieras',
        canActivate: [permisoGuard],
        data: { title: 'Operaciones financieras', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/caja-mayor/operaciones-financieras-list.page').then((m) => m.OperacionesFinancierasListPage),
      },
      {
        path: 'financiero/cajas',
        canActivate: [permisoGuard],
        data: { title: 'Cajas', permiso: 'FINANCIERO_CAJA_VER' },
        loadComponent: () => import('./pages/financiero/cajas/cajas-list.page').then((m) => m.CajasListPage),
      },
      {
        path: 'financiero/cuentas-bancarias',
        canActivate: [permisoGuard],
        data: { title: 'Cuentas bancarias', permiso: 'BANCOS_VER' },
        loadComponent: () => import('./pages/financiero/cuentas-bancarias/cuentas-bancarias-list.page').then((m) => m.CuentasBancariasListPage),
      },
      {
        path: 'financiero/gastos',
        canActivate: [permisoGuard],
        data: { title: 'Gastos', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/gastos/gastos-list.page').then((m) => m.GastosListPage),
      },
      {
        path: 'financiero/cxc',
        canActivate: [permisoGuard],
        data: { title: 'Cuentas por Cobrar', permiso: 'CPC_COBRAR' },
        loadComponent: () => import('./pages/financiero/cxc/cxc-list.page').then((m) => m.CxcListPage),
      },
      {
        path: 'financiero/cxp',
        canActivate: [permisoGuard],
        data: { title: 'Cuentas por Pagar', permiso: 'COMPRAS_GESTIONAR' },
        loadComponent: () => import('./pages/financiero/cxp/cxp-list.page').then((m) => m.CxpListPage),
      },
      {
        path: 'financiero/caja-mayor',
        canActivate: [permisoGuard],
        data: { title: 'Caja Mayor', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/caja-mayor/caja-mayor-list.page').then((m) => m.CajaMayorListPage),
      },
      {
        path: 'financiero/caja-mayor/:id',
        canActivate: [permisoGuard],
        data: { title: 'Caja Mayor', permiso: 'CAJA_MAYOR_OPERAR' },
        loadComponent: () => import('./pages/financiero/caja-mayor/caja-mayor-detalle.page').then((m) => m.CajaMayorDetallePage),
      },
      // --- Ventas (módulo meseros) ---
      {
        path: 'ventas',
        pathMatch: 'full',
        data: { title: 'Ventas', items: VENTAS_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'ventas/mesas',
        canActivate: [permisoGuard],
        data: { title: 'Mesas', permiso: 'VENTAS_PDV' },
        loadComponent: () => import('./pages/ventas/mesas/mesas-list.page').then((m) => m.MesasListPage),
      },
      {
        path: 'ventas/resumen',
        canActivate: [permisoGuard],
        data: { title: 'Resumen de ventas', permiso: 'VENTAS_HISTORICO_VER' },
        loadComponent: () => import('./pages/ventas/resumen/ventas-resumen.page').then((m) => m.VentasResumenPage),
      },
      // --- Reportes de cierre de mes ---
      {
        path: 'reportes',
        pathMatch: 'full',
        data: { title: 'Reportes', items: REPORTES_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'reportes/ventas',
        canActivate: [permisoGuard],
        data: { title: 'Reportes de Ventas', permiso: 'VENTAS_REPORTES_VER' },
        loadComponent: () => import('./pages/reportes/ventas/ventas-reportes.page').then((m) => m.VentasReportesPage),
      },
      {
        path: 'reportes/finanzas',
        canActivate: [permisoGuard],
        data: { title: 'Reportes Financieros', permiso: 'FINANCIERO_REPORTES_VER' },
        loadComponent: () => import('./pages/reportes/finanzas/finanzas-reportes.page').then((m) => m.FinanzasReportesPage),
      },
      {
        path: 'financiero/comisiones-reglas',
        canActivate: [permisoGuard],
        data: { title: 'Reglas de comisión', source: 'reglas-comision', permiso: 'COMISION_REGLA_VER' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'financiero/comisiones-equipos',
        canActivate: [permisoGuard],
        data: { title: 'Equipos de comisión', source: 'equipos-comision', permiso: 'COMISION_EQUIPO_GESTIONAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'financiero/comisiones-liquidaciones',
        canActivate: [permisoGuard],
        data: { title: 'Liq. de comisión', source: 'liquidaciones-comision', permiso: 'COMISION_LIQUIDACION_GENERAR' },
        loadComponent: () => import('./pages/rrhh/ops/rrhh-ops-list.page').then((m) => m.RrhhOpsListPage),
      },
      {
        path: 'compras',
        pathMatch: 'full',
        data: { title: 'Compras', items: COMPRAS_ITEMS },
        loadComponent: () => import('./pages/section-index/section-index.page').then((m) => m.SectionIndexPage),
      },
      {
        path: 'compras/categorias',
        canActivate: [permisoGuard],
        data: { title: 'Categorías de compra', permiso: 'COMPRAS_GESTIONAR' },
        loadComponent: () => import('./pages/compras/categorias/compra-categorias-list.page').then((m) => m.CompraCategoriasListPage),
      },
      {
        path: 'compras/lista',
        canActivate: [permisoGuard],
        data: { title: 'Compras', permiso: 'COMPRAS_VER' },
        loadComponent: () => import('./pages/compras/compras/compras-list.page').then((m) => m.ComprasListPage),
      },
      {
        path: 'compras/proveedores',
        canActivate: [permisoGuard],
        data: { title: 'Proveedores', permiso: 'PROVEEDORES_VER' },
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
        canActivate: [permisoGuard],
        data: { title: 'Familias', permiso: 'CATEGORIAS_GESTIONAR' },
        loadComponent: () => import('./pages/productos/familias/familias-list.page').then((m) => m.FamiliasListPage),
      },
      {
        path: 'productos/subfamilias',
        canActivate: [permisoGuard],
        data: { title: 'Subfamilias', permiso: 'CATEGORIAS_GESTIONAR' },
        loadComponent: () => import('./pages/productos/subfamilias/subfamilias-list.page').then((m) => m.SubfamiliasListPage),
      },
      {
        path: 'productos/adicionales',
        canActivate: [permisoGuard],
        data: { title: 'Adicionales', permiso: 'ADICIONALES_VER' },
        loadComponent: () => import('./pages/productos/adicionales/adicionales-list.page').then((m) => m.AdicionalesListPage),
      },
      {
        path: 'productos/lista',
        canActivate: [permisoGuard],
        data: { title: 'Productos', permiso: 'PRODUCTOS_VER' },
        loadComponent: () => import('./pages/productos/productos/productos-list.page').then((m) => m.ProductosListPage),
      },
      {
        path: 'productos/recetas',
        canActivate: [permisoGuard],
        data: { title: 'Recetas', permiso: 'RECETAS_VER' },
        loadComponent: () => import('./pages/productos/recetas/recetas-list.page').then((m) => m.RecetasListPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
