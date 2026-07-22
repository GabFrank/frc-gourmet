import { Type } from '@angular/core';
import { BackupRestoreComponent } from 'src/app/pages/configuracion/backup-restore/backup-restore.component';
import { BuffetDashboardComponent } from 'src/app/pages/ventas/buffet-dashboard/buffet-dashboard.component';
import { CajaMayorDashboardComponent } from 'src/app/pages/financiero/caja-mayor/dashboard/caja-mayor-dashboard.component';
import { ComprasDashboardComponent } from 'src/app/pages/compras/dashboard/compras-dashboard.component';
import { ConfiguracionFacialComponent } from 'src/app/pages/rrhh/configuracion-facial/configuracion-facial.component';
import { ConfiguracionNotificacionesComponent } from 'src/app/pages/configuracion/notificaciones/configuracion-notificaciones.component';
import { ConfigurarEmpresaComponent } from 'src/app/pages/sistema/configurar-empresa/configurar-empresa.component';
import { DbConfigComponent } from 'src/app/pages/configuracion/db-config/db-config.component';
import { FacturacionConfigComponent } from 'src/app/pages/facturacion/config/facturacion-config.component';
import { FinancieroDashboardComponent } from 'src/app/pages/financiero/dashboard/financiero-dashboard.component';
import { HomeComponent } from 'src/app/pages/home/home.component';
import { IaConfigComponent } from 'src/app/pages/configuracion/ia-config/ia-config.component';
import { KdsComponent } from 'src/app/pages/ventas/kds/kds.component';
import { ListAdicionalesComponent } from 'src/app/pages/gestion-recetas/list-adicionales/list-adicionales.component';
import { ListAguinaldosComponent } from 'src/app/pages/rrhh/aguinaldos/list-aguinaldos.component';
import { ListAsistenciasComponent } from 'src/app/pages/rrhh/asistencias/list-asistencias.component';
import { ListBonosComponent } from 'src/app/pages/rrhh/bonos/list-bonos.component';
import { ListCajasComponent } from 'src/app/pages/financiero/cajas/list-cajas.component';
import { ListCargosComponent } from 'src/app/pages/rrhh/cargos/list-cargos.component';
import { ListClientesComponent } from 'src/app/pages/personas/clientes/list-clientes.component';
import { ListComprasComponent } from 'src/app/pages/compras/list-compras/list-compras.component';
import { ListConfiguracionRrhhComponent } from 'src/app/pages/rrhh/configuracion/list-configuracion-rrhh/list-configuracion-rrhh.component';
import { ListConveniosComponent } from 'src/app/pages/personas/convenios/list-convenios.component';
import { ListCuentasPorCobrarComponent } from 'src/app/pages/financiero/caja-mayor/cuentas-por-cobrar/list-cuentas-por-cobrar/list-cuentas-por-cobrar.component';
import { ListDispositivosComponent } from 'src/app/pages/financiero/dispositivos/list-dispositivos.component';
import { ListEquiposComisionComponent } from 'src/app/pages/comisiones/equipos/list-equipos-comision/list-equipos-comision.component';
import { ListFacturaImportsComponent } from 'src/app/pages/compras/list-factura-imports/list-factura-imports.component';
import { ListFacturasComponent } from 'src/app/pages/facturacion/facturas/list-facturas/list-facturas.component';
import { ListFeriadosComponent } from 'src/app/pages/rrhh/feriados/list-feriados.component';
import { ListFuncionariosComponent } from 'src/app/pages/rrhh/funcionarios/list-funcionarios/list-funcionarios.component';
import { ListHorasExtraComponent } from 'src/app/pages/rrhh/horas-extra/list-horas-extra.component';
import { ListKdsPantallasComponent } from 'src/app/pages/ventas/kds/list-kds-pantallas/list-kds-pantallas.component';
import { ListLiquidacionesComisionComponent } from 'src/app/pages/comisiones/liquidaciones/list-liquidaciones-comision/list-liquidaciones-comision.component';
import { ListLiquidacionesSueldoComponent } from 'src/app/pages/rrhh/liquidaciones-sueldo/list/list-liquidaciones-sueldo.component';
import { ListMonedasComponent } from 'src/app/pages/financiero/monedas/list-monedas/list-monedas.component';
import { ListMotivosValeComponent } from 'src/app/pages/rrhh/motivos-vale/list-motivos-vale.component';
import { ListNotificacionesRrhhComponent } from 'src/app/pages/rrhh/notificaciones/list-notificaciones-rrhh.component';
import { ListPedidosOnlineComponent } from 'src/app/pages/ventas/pedidos-online/list-pedidos-online.component';
import { ListPenalizacionesComponent } from 'src/app/pages/rrhh/penalizaciones/list-penalizaciones.component';
import { ListPermisosComponent } from 'src/app/pages/personalizacion/permisos/list-permisos/list-permisos.component';
import { ListPersonasComponent } from 'src/app/pages/personas/personas/list-personas.component';
import { ListPlantillasComponent } from 'src/app/pages/facturacion/plantillas/list-plantillas/list-plantillas.component';
import { ListPrestamosFuncionariosComponent } from 'src/app/pages/rrhh/prestamos-funcionarios/list-prestamos-funcionarios.component';
import { ListProductosComponent } from 'src/app/pages/productos/list-productos/list-productos.component';
import { ListRecetasComponent } from 'src/app/pages/gestion-recetas/list-recetas/list-recetas.component';
import { ListReglasComisionComponent } from 'src/app/pages/comisiones/reglas/list-reglas-comision/list-reglas-comision.component';
import { ListSaboresComponent } from 'src/app/pages/gestion-sabores/list-sabores/list-sabores.component';
import { ListTimbradosComponent } from 'src/app/pages/facturacion/timbrados/list-timbrados/list-timbrados.component';
import { ListTurnosComponent } from 'src/app/pages/rrhh/turnos/list-turnos.component';
import { ListUsuariosComponent } from 'src/app/pages/personas/usuarios/list-usuarios.component';
import { ListVacacionesComponent } from 'src/app/pages/rrhh/vacaciones/list-vacaciones.component';
import { ListValesComponent } from 'src/app/pages/rrhh/vales/list-vales.component';
import { ModeConfigComponent } from 'src/app/pages/configuracion/mode-config/mode-config.component';
import { ProductosDashboardComponent } from 'src/app/pages/productos/dashboard/productos-dashboard.component';
import { ReportesRrhhPageComponent } from 'src/app/pages/rrhh/reportes/reportes-rrhh-page.component';
import { RrhhDashboardComponent } from 'src/app/pages/rrhh/dashboard/rrhh-dashboard.component';
import { TiendaOnlineConfigComponent } from 'src/app/pages/ventas/pedidos-online/tienda-online-config.component';
import { VentasDashboardComponent } from 'src/app/pages/ventas/dashboard/ventas-dashboard.component';
import { ZonasDeliveryComponent } from 'src/app/pages/ventas/pedidos-online/zonas-delivery.component';

/**
 * Registro de menús del sidenav para el BUSCADOR GLOBAL (Ctrl+Espacio).
 * Fuente de verdad de los ítems buscables. GENERADO desde app.component.ts/html.
 *
 * ⚠️ Al agregar un menú nuevo al sidenav, agregá su entrada aquí (regla dura #22
 *    de la skill). Si no, el menú funciona pero NO aparece en el buscador.
 *    Ver docs/BUSCADOR-GLOBAL.md.
 */
export interface MenuEntry {
  id: string;
  label: string;
  keywords: string[];
  icon: string;
  group: string;
  esConfig: boolean;
  permiso?: string;
  title: string;
  component: Type<any>;
  tabId: string;
  data?: any;
}

export const MENU_ENTRIES: MenuEntry[] = [
  { id: 'dashboard', label: "Dashboard", keywords: ["dashboard"], icon: 'dashboard', group: "", esConfig: false, permiso: 'HOME_DASHBOARD_VER', title: "Dashboard", component: HomeComponent, tabId: 'dashboard-tab', data: { source: 'navigation' } },
  { id: 'pedidos-online', label: "Pedidos Online", keywords: ["pedidos","online","ventas"], icon: 'shopping_bag', group: "Ventas", esConfig: false, permiso: 'VENTAS_PDV', title: "Pedidos Online", component: ListPedidosOnlineComponent, tabId: 'pedidos-online-tab', data: { source: 'navigation' } },
  { id: 'tienda-online-config', label: "Config Tienda Online", keywords: ["config","tienda","online","ventas"], icon: 'storefront', group: "Ventas", esConfig: true, permiso: 'VENTAS_PDV', title: "Config Tienda Online", component: TiendaOnlineConfigComponent, tabId: 'tienda-online-config-tab', data: { source: 'navigation' } },
  { id: 'zonas-delivery', label: "Zonas de Delivery", keywords: ["zonas","delivery","ventas"], icon: 'pin_drop', group: "Ventas", esConfig: true, permiso: 'VENTAS_PDV', title: "Zonas de Delivery", component: ZonasDeliveryComponent, tabId: 'zonas-delivery-tab', data: { source: 'navigation' } },
  { id: 'rrhh-dash', label: "Dashboard RRHH", keywords: ["dashboard","rrhh"], icon: 'dashboard', group: "Rrhh", esConfig: false, permiso: 'RRHH_DASHBOARD_VER', title: "RRHH Dashboard", component: RrhhDashboardComponent, tabId: 'rrhh-dash-tab', data: { source: 'navigation' } },
  { id: 'notificaciones-rrhh', label: "Notificaciones", keywords: ["notificaciones","rrhh"], icon: '0 ? notificacionesNoLeidas : null" matBadgeColor="warn" matBadgeSize="small">notifications', group: "Rrhh", esConfig: false, permiso: 'RRHH_NOTIFICACIONES_VER', title: "Notificaciones RRHH", component: ListNotificacionesRrhhComponent, tabId: 'notificaciones-rrhh-tab', data: {} },
  { id: 'reportes-rrhh', label: "Reportes RRHH", keywords: ["reportes","rrhh"], icon: 'assessment', group: "Rrhh", esConfig: false, permiso: 'RRHH_REPORTE_GENERAR', title: "Reportes RRHH", component: ReportesRrhhPageComponent, tabId: 'reportes-rrhh-tab', data: {} },
  { id: 'permisos', label: "Permisos", keywords: ["permisos"], icon: 'verified_user', group: "", esConfig: true, permiso: 'SISTEMA_PERMISO_GESTIONAR', title: "Permisos", component: ListPermisosComponent, tabId: 'permisos-tab', data: { source: 'navigation' } },
  { id: 'configuracion-rrhh', label: "Config RRHH", keywords: ["config","rrhh"], icon: 'tune', group: "", esConfig: true, permiso: 'RRHH_CONFIG_EDITAR', title: "Configuracion RRHH", component: ListConfiguracionRrhhComponent, tabId: 'configuracion-rrhh-tab', data: { source: 'navigation' } },
  { id: 'configuracion-facial', label: "Reconocimiento facial", keywords: ["reconocimiento","facial"], icon: 'face', group: "", esConfig: false, permiso: 'RRHH_CONFIG_EDITAR', title: "Reconocimiento facial", component: ConfiguracionFacialComponent, tabId: 'configuracion-facial-tab', data: { source: 'navigation' } },
  { id: 'configuracion-notificaciones', label: "Notificaciones", keywords: ["notificaciones","config"], icon: 'notifications_active', group: "Config", esConfig: true, permiso: 'NOTIFICACIONES_CONFIGURAR', title: "Notificaciones", component: ConfiguracionNotificacionesComponent, tabId: 'configuracion-notificaciones-tab', data: { source: 'navigation' } },
  { id: 'backup-restore', label: "Backup y Restauración", keywords: ["backup","restauracion","config"], icon: 'backup', group: "Config", esConfig: true, permiso: 'SISTEMA_BACKUP', title: "Backup y Restauración", component: BackupRestoreComponent, tabId: 'backup-restore-tab', data: { source: 'navigation' } },
  { id: 'configurar-empresa', label: "Datos de la Empresa", keywords: ["datos","empresa","config"], icon: 'business', group: "Config", esConfig: true, permiso: 'EMPRESA_CONFIGURAR', title: "Datos de la Empresa", component: ConfigurarEmpresaComponent, tabId: 'configurar-empresa-tab', data: { source: 'navigation' } },
  { id: 'ia-config', label: "Configurar IA", keywords: ["configurar","config"], icon: 'auto_awesome', group: "Config", esConfig: true, permiso: 'SISTEMA_CONFIGURAR_IA', title: "Configurar IA", component: IaConfigComponent, tabId: 'ia-config-tab', data: { source: 'navigation' } },
  { id: 'db-config', label: "Configurar BD", keywords: ["configurar","config"], icon: 'storage', group: "Config", esConfig: true, permiso: 'SISTEMA_BD_CONFIGURAR', title: "Configurar BD", component: DbConfigComponent, tabId: 'db-config-tab', data: { source: 'navigation' } },
  { id: 'mode-config', label: "Modo de operacion", keywords: ["modo","operacion","config"], icon: 'hub', group: "Config", esConfig: true, permiso: 'SISTEMA_MODO_CONFIGURAR', title: "Modo de operacion", component: ModeConfigComponent, tabId: 'mode-config-tab', data: { source: 'navigation' } },
  { id: 'cargos', label: "Cargos", keywords: ["cargos","rrhh"], icon: 'work', group: "Rrhh", esConfig: true, permiso: 'RRHH_FUNCIONARIO_VER', title: "Cargos", component: ListCargosComponent, tabId: 'cargos-tab', data: { source: 'navigation' } },
  { id: 'funcionarios', label: "Funcionarios", keywords: ["funcionarios","rrhh","empleados","personal"], icon: 'badge', group: "Rrhh", esConfig: false, permiso: 'RRHH_FUNCIONARIO_VER', title: "Funcionarios", component: ListFuncionariosComponent, tabId: 'funcionarios-tab', data: { source: 'navigation' } },
  { id: 'turnos', label: "Turnos", keywords: ["turnos","rrhh"], icon: 'schedule', group: "Rrhh", esConfig: true, permiso: 'RRHH_FUNCIONARIO_VER', title: "Turnos", component: ListTurnosComponent, tabId: 'turnos-tab', data: { source: 'navigation' } },
  { id: 'asistencias', label: "Asistencias", keywords: ["asistencias","rrhh","fichaje","marcaciones","presencia"], icon: 'fact_check', group: "Rrhh", esConfig: false, permiso: 'RRHH_ASISTENCIA_REGISTRAR', title: "Asistencias", component: ListAsistenciasComponent, tabId: 'asistencias-tab', data: { source: 'navigation' } },
  { id: 'penalizaciones', label: "Penalizaciones", keywords: ["penalizaciones","rrhh"], icon: 'gavel', group: "Rrhh", esConfig: false, permiso: 'RRHH_PENALIZACION_REGISTRAR', title: "Penalizaciones", component: ListPenalizacionesComponent, tabId: 'penalizaciones-tab', data: { source: 'navigation' } },
  { id: 'feriados', label: "Feriados", keywords: ["feriados"], icon: 'celebration', group: "", esConfig: true, permiso: 'RRHH_CONFIG_EDITAR', title: "Feriados", component: ListFeriadosComponent, tabId: 'feriados-tab', data: { source: 'navigation' } },
  { id: 'horas-extra', label: "Horas extra", keywords: ["horas","extra","rrhh"], icon: 'more_time', group: "Rrhh", esConfig: false, permiso: 'RRHH_ASISTENCIA_JUSTIFICAR', title: "Horas extra", component: ListHorasExtraComponent, tabId: 'horas-extra-tab', data: { source: 'navigation' } },
  { id: 'vales', label: "Vales", keywords: ["vales","rrhh","adelantos","prestamos"], icon: 'receipt_long', group: "Rrhh", esConfig: false, permiso: 'RRHH_VALE_CREAR', title: "Vales", component: ListValesComponent, tabId: 'vales-tab', data: { source: 'navigation' } },
  { id: 'motivos-vale', label: "Motivos de vale", keywords: ["motivos","vale","rrhh","adelanto"], icon: 'label', group: "Rrhh", esConfig: true, permiso: 'RRHH_VALE_CREAR', title: "Motivos de vale", component: ListMotivosValeComponent, tabId: 'motivos-vale-tab', data: { source: 'navigation' } },
  { id: 'prestamos-func', label: "Prestamos", keywords: ["prestamos","rrhh"], icon: 'account_balance', group: "Rrhh", esConfig: false, permiso: 'RRHH_PRESTAMO_OTORGAR', title: "Prestamos a funcionarios", component: ListPrestamosFuncionariosComponent, tabId: 'prestamos-func-tab', data: { source: 'navigation' } },
  { id: 'liquidaciones-sueldo', label: "Liquidaciones", keywords: ["liquidaciones","rrhh","sueldos","salarios","pagos","nomina"], icon: 'request_quote', group: "Rrhh", esConfig: false, permiso: 'RRHH_LIQUIDACION_GENERAR', title: "Liquidaciones sueldo", component: ListLiquidacionesSueldoComponent, tabId: 'liquidaciones-sueldo-tab', data: { source: 'navigation' } },
  { id: 'bonos', label: "Bonos", keywords: ["bonos","rrhh"], icon: 'card_giftcard', group: "Rrhh", esConfig: false, permiso: 'RRHH_BONO_OTORGAR', title: "Bonos", component: ListBonosComponent, tabId: 'bonos-tab', data: { source: 'navigation' } },
  { id: 'vacaciones', label: "Vacaciones", keywords: ["vacaciones"], icon: 'beach_access', group: "", esConfig: false, permiso: 'RRHH_VACACION_GESTIONAR', title: "Vacaciones", component: ListVacacionesComponent, tabId: 'vacaciones-tab', data: { source: 'navigation' } },
  { id: 'aguinaldos', label: "Aguinaldos", keywords: ["aguinaldos"], icon: 'star', group: "", esConfig: false, permiso: 'RRHH_LIQUIDACION_GENERAR', title: "Aguinaldos", component: ListAguinaldosComponent, tabId: 'aguinaldos-tab', data: { source: 'navigation' } },
  { id: 'reglas-comision', label: "Reglas", keywords: ["reglas","comisiones"], icon: 'rule', group: "Comisiones", esConfig: false, permiso: 'COMISION_REGLA_VER', title: "Reglas de Comisión", component: ListReglasComisionComponent, tabId: 'reglas-comision-tab', data: { source: 'navigation' } },
  { id: 'equipos-comision', label: "Equipos", keywords: ["equipos","comisiones"], icon: 'group', group: "Comisiones", esConfig: false, permiso: 'COMISION_EQUIPO_GESTIONAR', title: "Equipos Comisión", component: ListEquiposComisionComponent, tabId: 'equipos-comision-tab', data: { source: 'navigation' } },
  { id: 'liquidaciones-comision', label: "Liquidaciones", keywords: ["liquidaciones","comisiones"], icon: 'receipt', group: "Comisiones", esConfig: false, permiso: 'COMISION_LIQUIDACION_GENERAR', title: "Liquidaciones Comisión", component: ListLiquidacionesComisionComponent, tabId: 'liquidaciones-comision-tab', data: { source: 'navigation' } },
  { id: 'personas', label: "Personas", keywords: ["personas","rrhh"], icon: 'person', group: "Rrhh", esConfig: false, permiso: 'PERSONAS_VER', title: "Personas", component: ListPersonasComponent, tabId: 'personas-tab', data: { source: 'navigation' } },
  { id: 'usuarios', label: "Usuarios", keywords: ["usuarios","rrhh"], icon: 'account_circle', group: "Rrhh", esConfig: false, permiso: 'USUARIOS_GESTIONAR', title: "Usuarios", component: ListUsuariosComponent, tabId: 'usuarios-tab', data: { source: 'navigation' } },
  { id: 'clientes', label: "Clientes", keywords: ["clientes","rrhh","personas","cliente"], icon: 'business', group: "Rrhh", esConfig: false, permiso: 'CLIENTES_VER', title: "Clientes", component: ListClientesComponent, tabId: 'clientes-tab', data: { source: 'navigation' } },
  { id: 'convenios', label: "Convenios", keywords: ["convenios","rrhh"], icon: 'handshake', group: "Rrhh", esConfig: true, permiso: 'CLIENTES_VER', title: "Convenios", component: ListConveniosComponent, tabId: 'convenios-tab', data: { source: 'navigation' } },
  { id: 'productos', label: "Productos", keywords: ["productos","articulos","items","inventario"], icon: 'restaurant', group: "Productos", esConfig: false, permiso: 'PRODUCTOS_VER', title: "Lista de Productos", component: ListProductosComponent, tabId: 'productos-tab', data: { source: 'navigation' } },
  { id: 'monedas', label: "Monedas", keywords: ["monedas","financiero"], icon: 'monetization_on', group: "Financiero", esConfig: true, permiso: 'MONEDAS_GESTIONAR', title: "Monedas", component: ListMonedasComponent, tabId: 'monedas-tab', data: { source: 'navigation' } },
  { id: 'timbrados', label: "Timbrados", keywords: ["timbrados","facturacion"], icon: 'verified', group: "Facturacion", esConfig: false, permiso: undefined, title: "Timbrados", component: ListTimbradosComponent, tabId: 'timbrados-tab', data: { source: 'navigation' } },
  { id: 'plantillas-factura', label: "Plantillas / Diseños", keywords: ["plantillas","disenos","facturacion"], icon: 'design_services', group: "Facturacion", esConfig: false, permiso: undefined, title: "Plantillas de factura", component: ListPlantillasComponent, tabId: 'plantillas-factura-tab', data: { source: 'navigation' } },
  { id: 'facturacion-config', label: "Configuración", keywords: ["configuracion","facturacion"], icon: 'settings', group: "Facturacion", esConfig: true, permiso: undefined, title: "Config. facturación", component: FacturacionConfigComponent, tabId: 'facturacion-config-tab', data: { source: 'navigation' } },
  { id: 'facturas', label: "Facturas", keywords: ["facturas","facturacion"], icon: 'receipt_long', group: "Facturacion", esConfig: false, permiso: undefined, title: "Facturas", component: ListFacturasComponent, tabId: 'facturas-tab', data: { source: 'navigation' } },
  { id: 'recetas', label: "Recetas", keywords: ["recetas","productos"], icon: 'menu_book', group: "Productos", esConfig: false, permiso: 'RECETAS_VER', title: "Gestión de Recetas", component: ListRecetasComponent, tabId: 'recetas-tab', data: { source: 'navigation' } },
  { id: 'adicionales', label: "Adicionales", keywords: ["adicionales","productos"], icon: 'add_circle', group: "Productos", esConfig: false, permiso: 'ADICIONALES_VER', title: "Gestión de Adicionales", component: ListAdicionalesComponent, tabId: 'adicionales-tab', data: { source: 'navigation' } },
  { id: 'sabores', label: "Gestión de Sabores", keywords: ["gestion","sabores","productos"], icon: 'auto_awesome', group: "Productos", esConfig: false, permiso: 'SABORES_VER', title: "Gestión de Sabores", component: ListSaboresComponent, tabId: 'sabores-tab', data: { source: 'navigation' } },
  { id: 'financiero-dashboard', label: "Ingredientes", keywords: ["ingredientes","productos"], icon: 'egg', group: "Productos", esConfig: false, permiso: 'INGREDIENTES_VER', title: "Financiero Dashboard", component: FinancieroDashboardComponent, tabId: 'financiero-dashboard-tab', data: { source: 'navigation' } },
  { id: 'financiero-dashboard', label: "Tipos de Precio", keywords: ["tipos","precio","financiero"], icon: 'sell', group: "Financiero", esConfig: false, permiso: 'PRODUCTOS_GESTIONAR', title: "Financiero Dashboard", component: FinancieroDashboardComponent, tabId: 'financiero-dashboard-tab', data: { source: 'navigation' } },
  { id: 'financiero-dashboard', label: "Dashboard", keywords: ["dashboard","financiero"], icon: 'dashboard', group: "Financiero", esConfig: false, permiso: 'FINANCIERO_DASHBOARD_VER', title: "Financiero Dashboard", component: FinancieroDashboardComponent, tabId: 'financiero-dashboard-tab', data: { source: 'navigation' } },
  { id: 'cajas', label: "Cajas", keywords: ["cajas","financiero"], icon: 'point_of_sale', group: "Financiero", esConfig: false, permiso: 'FINANCIERO_CAJA_VER', title: "Cajas", component: ListCajasComponent, tabId: 'cajas-tab', data: { source: 'navigation' } },
  { id: 'dispositivos', label: "Dispositivos y puntos de venta", keywords: ["dispositivos","puntos","venta","config"], icon: 'devices', group: "Config", esConfig: true, permiso: 'DISPOSITIVOS_GESTIONAR', title: "Dispositivos y Puntos de Venta", component: ListDispositivosComponent, tabId: 'dispositivos-tab', data: { source: 'navigation' } },
  { id: 'caja-mayor', label: "Caja Mayor", keywords: ["caja","mayor","financiero","gastos","egresos","ingresos","movimientos","retiros","transferencias","caja mayor"], icon: 'account_balance', group: "Financiero", esConfig: false, permiso: 'CAJA_MAYOR_DASHBOARD_VER', title: "Caja Mayor", component: CajaMayorDashboardComponent, tabId: 'caja-mayor-tab', data: { source: 'navigation' } },
  { id: 'cuentas-por-cobrar', label: "Cuentas por Cobrar", keywords: ["cuentas","por","cobrar","financiero","cpc","cobros","deudas clientes"], icon: 'request_quote', group: "Financiero", esConfig: false, permiso: 'CPC_GESTIONAR', title: "Cuentas por Cobrar", component: ListCuentasPorCobrarComponent, tabId: 'cuentas-por-cobrar-tab', data: { source: 'navigation' } },
  { id: 'compras-dashboard', label: "Dashboard", keywords: ["dashboard","compras","proveedores"], icon: 'dashboard', group: "Compras", esConfig: false, permiso: 'COMPRAS_DASHBOARD_VER', title: "Dashboard de Compras", component: ComprasDashboardComponent, tabId: 'compras-dashboard-tab', data: { source: 'navigation' } },
  { id: 'compras', label: "Compras", keywords: ["compras","proveedores","compra"], icon: 'shopping_cart', group: "Compras", esConfig: false, permiso: 'COMPRAS_VER', title: "Compras", component: ListComprasComponent, tabId: 'compras-tab', data: { source: 'navigation' } },
  { id: 'factura-imports', label: "Importaciones IA", keywords: ["importaciones","compras","proveedores"], icon: 'auto_awesome', group: "Compras", esConfig: false, permiso: 'COMPRAS_IMPORTAR_FACTURA', title: "Importaciones IA", component: ListFacturaImportsComponent, tabId: 'factura-imports-tab', data: { source: 'navigation' } },
  { id: 'ventas-dashboard', label: "Movimientos de Stock", keywords: ["movimientos","stock","productos"], icon: 'inventory', group: "Productos", esConfig: false, permiso: 'STOCK_MOVIMIENTO_VER', title: "Dashboard de Ventas", component: VentasDashboardComponent, tabId: 'ventas-dashboard-tab', data: { source: 'navigation' } },
  { id: 'ventas-dashboard', label: "Dashboard", keywords: ["dashboard","ventas"], icon: 'dashboard', group: "Ventas", esConfig: false, permiso: 'VENTAS_DASHBOARD_VER', title: "Dashboard de Ventas", component: VentasDashboardComponent, tabId: 'ventas-dashboard-tab', data: { source: 'navigation' } },
  { id: 'buffet-dashboard', label: "Buffet por kilo", keywords: ["buffet","por","kilo","ventas"], icon: 'scale', group: "Ventas", esConfig: false, permiso: 'VENTAS_DASHBOARD_VER', title: "Buffet por kilo", component: BuffetDashboardComponent, tabId: 'buffet-dashboard-tab', data: { source: 'navigation' } },
  { id: 'kds', label: "KDS — Cocina", keywords: ["kds","cocina","ventas"], icon: 'restaurant', group: "Ventas", esConfig: true, permiso: 'COMANDAS_KDS_VER', title: "KDS — Cocina", component: KdsComponent, tabId: 'kds-tab', data: { source: 'navigation' } },
  { id: 'kds-pantallas', label: "Pantallas KDS", keywords: ["pantallas","kds","ventas"], icon: 'tv', group: "Ventas", esConfig: true, permiso: 'COMANDAS_KDS_CONFIGURAR', title: "Pantallas KDS", component: ListKdsPantallasComponent, tabId: 'kds-pantallas-tab', data: { source: 'navigation' } },
  { id: 'producto-dashboard', label: "Dashboard", keywords: ["dashboard","productos"], icon: 'dashboard', group: "Productos", esConfig: false, permiso: 'PRODUCTOS_DASHBOARD_VER', title: "Dashboard de productos", component: ProductosDashboardComponent, tabId: 'producto-dashboard-tab', data: { source: 'navigation' } },
];
