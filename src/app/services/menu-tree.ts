// ── Destinos del sidenav (tabs) ──
import { BackupRestoreComponent } from 'src/app/pages/configuracion/backup-restore/backup-restore.component';
import { BuffetDashboardComponent } from 'src/app/pages/ventas/buffet-dashboard/buffet-dashboard.component';
import { ComprasDashboardComponent } from 'src/app/pages/compras/dashboard/compras-dashboard.component';
import { ConfiguracionFacialComponent } from 'src/app/pages/rrhh/configuracion-facial/configuracion-facial.component';
import { ConfiguracionNotificacionesComponent } from 'src/app/pages/configuracion/notificaciones/configuracion-notificaciones.component';
import { MusicaComponent } from 'src/app/pages/configuracion/musica/musica.component';
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
import { MesasQrComponent } from 'src/app/pages/ventas/pedidos-online/mesas-qr/mesas-qr.component';
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
import { VentasReportesComponent } from 'src/app/pages/reportes/ventas-reportes/ventas-reportes.component';
import { FinanzasReportesComponent } from 'src/app/pages/reportes/finanzas-reportes/finanzas-reportes.component';
import { ZonasDeliveryComponent } from 'src/app/pages/ventas/pedidos-online/zonas-delivery.component';

// ── Destinos fuera del sidenav (sub-listados y acciones) ──
import { ListCajasMayorComponent } from 'src/app/pages/financiero/caja-mayor/list-cajas-mayor/list-cajas-mayor.component';
import { ListChequerasComponent } from 'src/app/pages/financiero/caja-mayor/cheques/list-chequeras/list-chequeras.component';
import { ListChequesComponent } from 'src/app/pages/financiero/caja-mayor/cheques/list-cheques/list-cheques.component';
import { ListCompraCategoriasComponent } from 'src/app/pages/compras/categorias/list-compra-categorias.component';
import { ListCuentasBancariasComponent } from 'src/app/pages/financiero/caja-mayor/bancos/list-cuentas-bancarias/list-cuentas-bancarias.component';
import { ListCuentasPorPagarComponent } from 'src/app/pages/financiero/caja-mayor/cuentas-por-pagar/list-cuentas-por-pagar/list-cuentas-por-pagar.component';
import { ListEntradasVariasComponent } from 'src/app/pages/financiero/caja-mayor/entradas-varias/list-entradas-varias/list-entradas-varias.component';
import { ListEntradaVariaCategoriasComponent } from 'src/app/pages/financiero/caja-mayor/entradas-varias/categorias/list-entrada-varia-categorias.component';
import { ListFamiliasComponent } from 'src/app/pages/productos/familias/list-familias.component';
import { ListGastoCategoriasComponent } from 'src/app/pages/financiero/caja-mayor/gastos/categorias/list-gasto-categorias.component';
import { ListGastosComponent } from 'src/app/pages/financiero/caja-mayor/gastos/list-gastos/list-gastos.component';
import { ListMaquinasPosComponent } from 'src/app/pages/financiero/caja-mayor/pos/list-maquinas-pos/list-maquinas-pos.component';
import { ListAcreditacionesPosComponent } from 'src/app/pages/financiero/caja-mayor/pos/acreditaciones/list-acreditaciones-pos.component';
import { ListOperacionesFinancierasComponent } from 'src/app/pages/financiero/caja-mayor/operaciones-financieras/list-operaciones-financieras/list-operaciones-financieras.component';
import { ListOperacionFinancieraCategoriasComponent } from 'src/app/pages/financiero/caja-mayor/operaciones-financieras/categorias/list-operacion-financiera-categorias.component';
import { ListProveedoresComponent } from 'src/app/pages/compras/proveedores/list-proveedores.component';
import { ListRetirosCajaComponent } from 'src/app/pages/financiero/caja-mayor/retiros/list-retiros-caja/list-retiros-caja.component';
import { ListVentasComponent } from 'src/app/pages/ventas/historial/list-ventas.component';
import { PdvComponent } from 'src/app/pages/ventas/pdv/pdv.component';
import { GestionarProductoComponent } from 'src/app/pages/productos/gestionar-producto/gestionar-producto.component';
import { GestionRecetasComponent } from 'src/app/pages/gestion-recetas/gestion-recetas.component';

// ── Diálogos-destino ──
import { MenuConfigComponent } from 'src/app/pages/sistema/menu-config/menu-config.component';
import { ConfigMonedasDialogComponent } from 'src/app/pages/financiero/monedas/config-monedas/config-monedas-dialog.component';
import { PdvConfigDialogComponent } from 'src/app/shared/components/pdv-config-dialog/pdv-config-dialog.component';
import { AtajoConfigDialogComponent } from 'src/app/shared/components/atajo-config-dialog/atajo-config-dialog.component';
import { ForceChangePasswordDialogComponent } from 'src/app/auth/force-change-password-dialog/force-change-password-dialog.component';
import { PrinterSettingsComponent } from 'src/app/components/printer-settings/printer-settings.component';
import { SectoresImpresorasSettingsComponent } from 'src/app/components/sectores-impresoras-settings/sectores-impresoras-settings.component';

/**
 * ÁRBOL DE MENÚ — FUENTE ÚNICA DE VERDAD del sidenav Y del buscador global.
 *
 * Un `MenuNode` es:
 *  - **rama** (grupo) si tiene `children` — se renderiza como panel expandible.
 *  - **hoja** (destino) si tiene `action` — abre un tab o un diálogo.
 *
 * Cada nodo declara con booleanos dónde aparece:
 *  - `enSidenav` (default true): visible en el menú lateral.
 *  - `enBuscador` (default true): indexable por el buscador global (Ctrl+Espacio).
 *
 * Así el sidenav puede crecer de forma controlada (grupos anidados hasta 3
 * niveles) mientras el buscador indexa TODO lo navegable. Al agregar una
 * pantalla nueva, agregá su hoja acá y ya queda en ambos lados.
 *
 * ⚠️ Regla dura: toda pantalla navegable nueva debe tener su hoja acá
 *    (ver docs/BUSCADOR-GLOBAL.md). El ADMIN puede sobreescribir visibilidad
 *    y orden vía configuración persistida (ver menu.service.ts).
 */
// Tipos y helpers puros viven en menu-tree-utils.ts (sin imports de componentes)
// para poder testearlos en Node. Se re-exportan acá para compatibilidad.
export {
  MenuAction, MenuNode, MenuLeaf, MenuOverride, OverrideMap,
  esHoja, buildSidenavTree, flattenBuscables,
} from 'src/app/services/menu-tree-utils';
import { MenuNode } from 'src/app/services/menu-tree-utils';

const NAV = { source: 'navigation' };

export const MENU_TREE: MenuNode[] = [
  // ═══════════════════════════ INICIO ═══════════════════════════
  {
    id: 'dashboard', label: 'Dashboard', icon: 'dashboard', permiso: 'HOME_DASHBOARD_VER',
    keywords: ['inicio', 'home', 'dashboard'],
    action: { component: HomeComponent, title: 'Dashboard', tabId: 'dashboard-tab', data: NAV },
  },

  // ═══════════════════════════ VENTAS ═══════════════════════════
  {
    id: 'grp-ventas', label: 'Ventas', icon: 'shopping_cart',
    children: [
      { id: 'ventas-dashboard', label: 'Dashboard', icon: 'dashboard', permiso: 'VENTAS_DASHBOARD_VER',
        keywords: ['ventas', 'dashboard'],
        action: { component: VentasDashboardComponent, title: 'Dashboard de Ventas', tabId: 'ventas-dashboard-tab', data: NAV } },
      { id: 'pdv', label: 'Punto de Venta (PDV)', icon: 'point_of_sale', permiso: 'VENTAS_PDV',
        keywords: ['pdv', 'punto', 'venta', 'caja', 'mesas'],
        action: { component: PdvComponent, title: 'Punto de Venta (PDV)', tabId: 'pdv-tab', data: {} } },
      { id: 'historial-ventas', label: 'Historial de Ventas', icon: 'history', permiso: 'VENTAS_HISTORICO_VER',
        keywords: ['historial', 'ventas', 'facturas'],
        action: { component: ListVentasComponent, title: 'Historial de Ventas', tabId: 'historial-ventas-tab', data: {} } },
      { id: 'buffet-dashboard', label: 'Buffet por kilo', icon: 'scale', permiso: 'VENTAS_DASHBOARD_VER',
        keywords: ['buffet', 'kilo', 'peso'],
        action: { component: BuffetDashboardComponent, title: 'Buffet por kilo', tabId: 'buffet-dashboard-tab', data: NAV } },
      { id: 'pedidos-online', label: 'Pedidos Online', icon: 'shopping_bag', permiso: 'VENTAS_PDV',
        keywords: ['pedidos', 'online', 'delivery'],
        action: { component: ListPedidosOnlineComponent, title: 'Pedidos Online', tabId: 'pedidos-online-tab', data: NAV } },
      { id: 'mesas-qr', label: 'QR de Mesas', icon: 'qr_code_2', permiso: 'VENTAS_PDV',
        keywords: ['qr', 'mesa', 'mesas', 'autoservicio', 'tienda', 'lamina', 'imprimir'],
        action: { component: MesasQrComponent, title: 'QR de Mesas', tabId: 'mesas-qr-tab', data: NAV } },
      { id: 'kds', label: 'KDS — Cocina', icon: 'restaurant', permiso: 'COMANDAS_KDS_VER',
        keywords: ['kds', 'cocina', 'comandas'],
        action: { component: KdsComponent, title: 'KDS — Cocina', tabId: 'kds-tab', data: NAV } },
      {
        id: 'grp-ventas-config', label: 'Configuración', icon: 'settings',
        children: [
          { id: 'tienda-online-config', label: 'Config Tienda Online', icon: 'storefront', permiso: 'VENTAS_PDV', esConfig: true,
            keywords: ['tienda', 'online', 'config'],
            action: { component: TiendaOnlineConfigComponent, title: 'Config Tienda Online', tabId: 'tienda-online-config-tab', data: NAV } },
          { id: 'zonas-delivery', label: 'Zonas de Delivery', icon: 'pin_drop', permiso: 'VENTAS_PDV', esConfig: true,
            keywords: ['zonas', 'delivery', 'reparto'],
            action: { component: ZonasDeliveryComponent, title: 'Zonas de Delivery', tabId: 'zonas-delivery-tab', data: NAV } },
          { id: 'kds-pantallas', label: 'Pantallas KDS', icon: 'tv', permiso: 'COMANDAS_KDS_CONFIGURAR', esConfig: true,
            keywords: ['pantallas', 'kds', 'cocina'],
            action: { component: ListKdsPantallasComponent, title: 'Pantallas KDS', tabId: 'kds-pantallas-tab', data: NAV } },
          { id: 'config-pdv', label: 'Configuración de PdV', icon: 'tune', permiso: 'VENTAS_PDV', esConfig: true,
            keywords: ['configuracion', 'pdv', 'punto', 'venta'],
            action: { mode: 'dialog', component: PdvConfigDialogComponent, title: 'Configuración de PdV', data: {}, dialogConfig: { width: '760px', maxWidth: '95vw' } } },
          { id: 'config-atajos', label: 'Configurar Atajos', icon: 'grid_view', permiso: 'VENTAS_PDV', esConfig: true,
            keywords: ['atajos', 'accesos', 'pdv'],
            action: { mode: 'dialog', component: AtajoConfigDialogComponent, title: 'Configurar Atajos', data: {}, dialogConfig: { width: '90vw', maxWidth: '90vw', height: '80vh' } } },
        ],
      },
    ],
  },

  // ═══════════════════════════ COMPRAS ═══════════════════════════
  {
    id: 'grp-compras', label: 'Compras', icon: 'local_shipping',
    children: [
      { id: 'compras-dashboard', label: 'Dashboard', icon: 'dashboard', permiso: 'COMPRAS_DASHBOARD_VER',
        keywords: ['compras', 'dashboard'],
        action: { component: ComprasDashboardComponent, title: 'Dashboard de Compras', tabId: 'compras-dashboard-tab', data: NAV } },
      { id: 'compras', label: 'Compras', icon: 'shopping_cart', permiso: 'COMPRAS_VER',
        keywords: ['compras', 'compra', 'proveedores'],
        action: { component: ListComprasComponent, title: 'Compras', tabId: 'compras-tab', data: NAV } },
      { id: 'proveedores', label: 'Proveedores', icon: 'local_shipping', permiso: 'PROVEEDORES_VER',
        keywords: ['proveedores', 'proveedor'],
        action: { component: ListProveedoresComponent, title: 'Proveedores', tabId: 'proveedores-tab', data: {} } },
      { id: 'factura-imports', label: 'Importaciones IA', icon: 'auto_awesome', permiso: 'COMPRAS_IMPORTAR_FACTURA',
        keywords: ['importaciones', 'ocr', 'ia', 'facturas'],
        action: { component: ListFacturaImportsComponent, title: 'Importaciones IA', tabId: 'factura-imports-tab', data: NAV } },
      {
        id: 'grp-compras-config', label: 'Configuración', icon: 'settings',
        children: [
          { id: 'compra-categorias', label: 'Categorías de Compra', icon: 'category', permiso: 'COMPRAS_VER', esConfig: true,
            keywords: ['categoria', 'compra', 'compras'],
            action: { component: ListCompraCategoriasComponent, title: 'Categorias de Compra', tabId: 'compra-categorias-tab', data: {} } },
        ],
      },
    ],
  },

  // ═══════════════════════════ PRODUCTOS ═══════════════════════════
  {
    id: 'grp-productos', label: 'Productos', icon: 'inventory_2',
    children: [
      { id: 'producto-dashboard', label: 'Dashboard', icon: 'dashboard', permiso: 'PRODUCTOS_DASHBOARD_VER',
        keywords: ['productos', 'dashboard'],
        action: { component: ProductosDashboardComponent, title: 'Dashboard de productos', tabId: 'producto-dashboard-tab', data: NAV } },
      { id: 'productos', label: 'Productos', icon: 'restaurant', permiso: 'PRODUCTOS_VER',
        keywords: ['productos', 'articulos', 'items', 'inventario'],
        action: { component: ListProductosComponent, title: 'Lista de Productos', tabId: 'productos-tab', data: NAV } },
      { id: 'recetas', label: 'Recetas', icon: 'menu_book', permiso: 'RECETAS_VER',
        keywords: ['recetas', 'receta'],
        action: { component: ListRecetasComponent, title: 'Gestión de Recetas', tabId: 'recetas-tab', data: NAV } },
      { id: 'sabores', label: 'Gestión de Sabores', icon: 'auto_awesome', permiso: 'SABORES_VER',
        keywords: ['sabores', 'sabor', 'pizza'],
        action: { component: ListSaboresComponent, title: 'Gestión de Sabores', tabId: 'sabores-tab', data: NAV } },
      { id: 'adicionales', label: 'Adicionales', icon: 'add_circle', permiso: 'ADICIONALES_VER',
        keywords: ['adicionales', 'extras'],
        action: { component: ListAdicionalesComponent, title: 'Gestión de Adicionales', tabId: 'adicionales-tab', data: NAV } },
      {
        id: 'grp-productos-config', label: 'Configuración', icon: 'settings',
        children: [
          { id: 'familias', label: 'Familias', icon: 'account_tree', permiso: 'PRODUCTOS_VER', esConfig: true,
            keywords: ['familias', 'subfamilias', 'rubros', 'categorias'],
            action: { component: ListFamiliasComponent, title: 'Familias', tabId: 'familias-tab', data: {} } },
        ],
      },
      // Acción de creación (solo buscador, no ocupa lugar en el sidenav)
      { id: 'crear-producto', label: 'Crear producto', icon: 'add_box', permiso: 'PRODUCTOS_VER', enSidenav: false,
        keywords: ['crear', 'nuevo', 'producto'],
        action: { component: GestionarProductoComponent, title: 'Nuevo Producto', tabId: 'nuevo-producto-tab', data: { mode: 'create' } } },
      { id: 'crear-receta', label: 'Crear receta', icon: 'add_box', permiso: 'PRODUCTOS_VER', enSidenav: false,
        keywords: ['crear', 'nueva', 'receta'],
        action: { component: GestionRecetasComponent, title: 'Nueva Receta', tabId: 'nueva-receta-tab', data: { mode: 'create' } } },
    ],
  },

  // ═══════════════════════════ FINANCIERO ═══════════════════════════
  {
    id: 'grp-financiero', label: 'Financiero', icon: 'attach_money',
    children: [
      { id: 'financiero-dashboard', label: 'Dashboard', icon: 'dashboard', permiso: 'FINANCIERO_DASHBOARD_VER',
        keywords: ['financiero', 'dashboard'],
        action: { component: FinancieroDashboardComponent, title: 'Financiero Dashboard', tabId: 'financiero-dashboard-tab', data: NAV } },
      { id: 'cajas', label: 'Cajas', icon: 'point_of_sale', permiso: 'FINANCIERO_CAJA_VER',
        keywords: ['cajas', 'arqueo', 'apertura', 'cierre'],
        action: { component: ListCajasComponent, title: 'Cajas', tabId: 'cajas-tab', data: NAV } },
      {
        // El "dashboard" de Caja Mayor se unificó en el Dashboard Financiero
        // (arriba). Este subgrupo queda solo con la operativa, sin dashboard
        // propio, para no duplicar puntos de entrada.
        id: 'grp-caja-mayor', label: 'Caja Mayor', icon: 'account_balance_wallet',
        children: [
          { id: 'cajas-mayor', label: 'Cajas Mayor', icon: 'account_balance', permiso: 'CAJA_MAYOR_DASHBOARD_VER',
            keywords: ['cajas', 'mayor'],
            action: { component: ListCajasMayorComponent, title: 'Cajas Mayor', tabId: 'cajas-mayor-tab', data: {} } },
          { id: 'gastos', label: 'Gastos', icon: 'receipt_long', permiso: 'FINANCIERO_CAJA_VER',
            keywords: ['gastos', 'egresos'],
            action: { component: ListGastosComponent, title: 'Gastos', tabId: 'gastos-tab', data: {} } },
          { id: 'entradas-varias', label: 'Entradas Varias', icon: 'input', permiso: 'FINANCIERO_CAJA_VER',
            keywords: ['entradas', 'ingresos', 'varias'],
            action: { component: ListEntradasVariasComponent, title: 'Entradas Varias', tabId: 'entradas-varias-tab', data: {} } },
          { id: 'operaciones-financieras', label: 'Operaciones Financieras', icon: 'swap_horiz', permiso: 'FINANCIERO_CAJA_VER',
            keywords: ['operaciones', 'financieras', 'cambio', 'transferencia'],
            action: { component: ListOperacionesFinancierasComponent, title: 'Operaciones Financieras', tabId: 'operaciones-financieras-tab', data: {} } },
          { id: 'retiros-caja', label: 'Retiros de Caja', icon: 'output', permiso: 'FINANCIERO_CAJA_VER',
            keywords: ['retiros', 'caja', 'efectivo'],
            action: { component: ListRetirosCajaComponent, title: 'Retiros de Caja', tabId: 'retiros-caja-tab', data: {} } },
          { id: 'cuentas-por-pagar', label: 'Cuentas por Pagar', icon: 'request_quote', permiso: 'CAJA_MAYOR_DASHBOARD_VER',
            keywords: ['cuentas', 'pagar', 'cpp', 'deudas', 'proveedores'],
            action: { component: ListCuentasPorPagarComponent, title: 'Cuentas por Pagar', tabId: 'cuentas-por-pagar-tab', data: {} } },
          { id: 'cuentas-por-cobrar', label: 'Cuentas por Cobrar', icon: 'paid', permiso: 'CPC_GESTIONAR',
            keywords: ['cuentas', 'cobrar', 'cpc', 'cobros', 'deudas', 'clientes'],
            action: { component: ListCuentasPorCobrarComponent, title: 'Cuentas por Cobrar', tabId: 'cuentas-por-cobrar-tab', data: NAV } },
        ],
      },
      {
        id: 'grp-bancos', label: 'Bancos', icon: 'account_balance',
        children: [
          { id: 'cuentas-bancarias', label: 'Cuentas Bancarias', icon: 'account_balance', permiso: 'BANCOS_VER',
            keywords: ['cuentas', 'bancarias', 'banco'],
            action: { component: ListCuentasBancariasComponent, title: 'Cuentas Bancarias', tabId: 'cuentas-bancarias-tab', data: {} } },
          { id: 'cheques', label: 'Cheques', icon: 'request_quote', permiso: 'BANCOS_VER',
            keywords: ['cheques', 'cheque', 'banco'],
            action: { component: ListChequesComponent, title: 'Cheques', tabId: 'cheques-tab', data: {} } },
          { id: 'chequeras', label: 'Chequeras', icon: 'menu_book', permiso: 'BANCOS_VER', esConfig: true,
            keywords: ['chequeras', 'cheques', 'banco'],
            action: { component: ListChequerasComponent, title: 'Chequeras', tabId: 'chequeras-tab', data: {} } },
          { id: 'maquinas-pos', label: 'Máquinas POS', icon: 'point_of_sale', permiso: 'BANCOS_VER',
            keywords: ['maquinas', 'pos', 'tarjeta'],
            action: { component: ListMaquinasPosComponent, title: 'Maquinas POS', tabId: 'maquinas-pos-tab', data: {} } },
          { id: 'acreditaciones-pos', label: 'Acreditaciones POS', icon: 'credit_score', permiso: 'BANCOS_VER',
            keywords: ['acreditaciones', 'pos', 'tarjeta', 'liquidacion'],
            action: { component: ListAcreditacionesPosComponent, title: 'Acreditaciones POS', tabId: 'acreditaciones-pos-tab', data: {} } },
        ],
      },
      {
        id: 'grp-financiero-config', label: 'Configuración', icon: 'settings',
        children: [
          { id: 'monedas', label: 'Monedas', icon: 'monetization_on', permiso: 'MONEDAS_GESTIONAR', esConfig: true,
            keywords: ['monedas', 'divisas'],
            action: { component: ListMonedasComponent, title: 'Monedas', tabId: 'monedas-tab', data: NAV } },
          { id: 'config-monedas', label: 'Configurar Monedas', icon: 'payments', permiso: 'MONEDAS_GESTIONAR', esConfig: true,
            keywords: ['configurar', 'monedas', 'cotizaciones'],
            action: { mode: 'dialog', component: ConfigMonedasDialogComponent, title: 'Configurar Monedas', data: {}, dialogConfig: { width: '800px', maxWidth: '95vw' } } },
          { id: 'gasto-categorias', label: 'Categorías de Gasto', icon: 'category', permiso: 'FINANCIERO_CAJA_VER', esConfig: true,
            keywords: ['categoria', 'gasto', 'egresos'],
            action: { component: ListGastoCategoriasComponent, title: 'Categorias de Gasto', tabId: 'gasto-categorias-tab', data: {} } },
          { id: 'entrada-varia-categorias', label: 'Categorías de Entradas Varias', icon: 'category', permiso: 'FINANCIERO_CAJA_VER', esConfig: true,
            keywords: ['categoria', 'entradas', 'ingresos'],
            action: { component: ListEntradaVariaCategoriasComponent, title: 'Categorias de Entradas Varias', tabId: 'entrada-varia-categorias-tab', data: {} } },
          { id: 'operacion-financiera-categorias', label: 'Categorías de Op. Financieras', icon: 'category', permiso: 'FINANCIERO_CAJA_VER', esConfig: true,
            keywords: ['categoria', 'operaciones', 'financieras'],
            action: { component: ListOperacionFinancieraCategoriasComponent, title: 'Categorias de Op. Financieras', tabId: 'operacion-financiera-categorias-tab', data: {} } },
        ],
      },
    ],
  },

  // ═══════════════════════════════ REPORTES ═══════════════════════════════
  {
    id: 'grp-reportes', label: 'Reportes', icon: 'assessment',
    children: [
      { id: 'reportes-ventas', label: 'Reportes de Ventas', icon: 'insights', permiso: 'VENTAS_REPORTES_VER',
        keywords: ['reportes', 'reporte', 'ventas', 'cierre', 'mes', 'analisis', 'informe', 'kpi'],
        action: { component: VentasReportesComponent, title: 'Reportes de Ventas', tabId: 'reportes-ventas-tab', data: NAV } },
      { id: 'reportes-finanzas', label: 'Reportes Financieros', icon: 'account_balance_wallet', permiso: 'FINANCIERO_REPORTES_VER',
        keywords: ['reportes', 'reporte', 'finanzas', 'financiero', 'cierre', 'mes', 'flujo', 'caja', 'gastos', 'analisis'],
        action: { component: FinanzasReportesComponent, title: 'Reportes Financieros', tabId: 'reportes-finanzas-tab', data: NAV } },
    ],
  },

  // ═══════════════════════════ RECURSOS HUMANOS ═══════════════════════════
  {
    id: 'grp-rrhh', label: 'Recursos Humanos', icon: 'people',
    children: [
      { id: 'rrhh-dash', label: 'Dashboard RRHH', icon: 'dashboard', permiso: 'RRHH_DASHBOARD_VER',
        keywords: ['dashboard', 'rrhh'],
        action: { component: RrhhDashboardComponent, title: 'RRHH Dashboard', tabId: 'rrhh-dash-tab', data: NAV } },
      { id: 'reportes-rrhh', label: 'Reportes RRHH', icon: 'assessment', permiso: 'RRHH_REPORTE_GENERAR',
        keywords: ['reportes', 'rrhh', 'informes'],
        action: { component: ReportesRrhhPageComponent, title: 'Reportes RRHH', tabId: 'reportes-rrhh-tab', data: {} } },
      { id: 'notificaciones-rrhh', label: 'Notificaciones', icon: 'notifications', permiso: 'RRHH_NOTIFICACIONES_VER', badgeKey: 'rrhhNotif',
        keywords: ['notificaciones', 'rrhh', 'alertas'],
        action: { component: ListNotificacionesRrhhComponent, title: 'Notificaciones RRHH', tabId: 'notificaciones-rrhh-tab', data: {} } },
      {
        id: 'grp-rrhh-personal', label: 'Personal', icon: 'badge',
        children: [
          { id: 'funcionarios', label: 'Funcionarios', icon: 'badge', permiso: 'RRHH_FUNCIONARIO_VER',
            keywords: ['funcionarios', 'empleados', 'personal'],
            action: { component: ListFuncionariosComponent, title: 'Funcionarios', tabId: 'funcionarios-tab', data: NAV } },
          { id: 'cargos', label: 'Cargos', icon: 'work', permiso: 'RRHH_FUNCIONARIO_VER', esConfig: true,
            keywords: ['cargos', 'puestos'],
            action: { component: ListCargosComponent, title: 'Cargos', tabId: 'cargos-tab', data: NAV } },
          { id: 'turnos', label: 'Turnos', icon: 'schedule', permiso: 'RRHH_FUNCIONARIO_VER', esConfig: true,
            keywords: ['turnos', 'horarios'],
            action: { component: ListTurnosComponent, title: 'Turnos', tabId: 'turnos-tab', data: NAV } },
        ],
      },
      {
        id: 'grp-rrhh-asistencia', label: 'Asistencia', icon: 'fact_check',
        children: [
          { id: 'asistencias', label: 'Historial de marcaciones', icon: 'fact_check', permiso: 'RRHH_ASISTENCIA_REGISTRAR',
            keywords: ['asistencias', 'marcaciones', 'fichaje', 'presencia'],
            action: { component: ListAsistenciasComponent, title: 'Asistencias', tabId: 'asistencias-tab', data: NAV } },
          { id: 'horas-extra', label: 'Horas extra', icon: 'more_time', permiso: 'RRHH_ASISTENCIA_JUSTIFICAR',
            keywords: ['horas', 'extra'],
            action: { component: ListHorasExtraComponent, title: 'Horas extra', tabId: 'horas-extra-tab', data: NAV } },
          { id: 'penalizaciones', label: 'Penalizaciones', icon: 'gavel', permiso: 'RRHH_PENALIZACION_REGISTRAR',
            keywords: ['penalizaciones', 'sanciones'],
            action: { component: ListPenalizacionesComponent, title: 'Penalizaciones', tabId: 'penalizaciones-tab', data: NAV } },
        ],
      },
      {
        id: 'grp-rrhh-anticipos', label: 'Anticipos y Beneficios', icon: 'savings',
        children: [
          { id: 'vales', label: 'Vales', icon: 'receipt_long', permiso: 'RRHH_VALE_CREAR',
            keywords: ['vales', 'adelantos'],
            action: { component: ListValesComponent, title: 'Vales', tabId: 'vales-tab', data: NAV } },
          { id: 'prestamos-func', label: 'Préstamos', icon: 'account_balance', permiso: 'RRHH_PRESTAMO_OTORGAR',
            keywords: ['prestamos', 'creditos'],
            action: { component: ListPrestamosFuncionariosComponent, title: 'Prestamos a funcionarios', tabId: 'prestamos-func-tab', data: NAV } },
          { id: 'bonos', label: 'Bonos', icon: 'card_giftcard', permiso: 'RRHH_BONO_OTORGAR',
            keywords: ['bonos', 'incentivos'],
            action: { component: ListBonosComponent, title: 'Bonos', tabId: 'bonos-tab', data: NAV } },
          { id: 'vacaciones', label: 'Vacaciones', icon: 'beach_access', permiso: 'RRHH_VACACION_GESTIONAR',
            keywords: ['vacaciones', 'descanso'],
            action: { component: ListVacacionesComponent, title: 'Vacaciones', tabId: 'vacaciones-tab', data: NAV } },
        ],
      },
      {
        id: 'grp-rrhh-liquidaciones', label: 'Liquidaciones', icon: 'request_quote',
        children: [
          { id: 'liquidaciones-sueldo', label: 'Liquidaciones de sueldo', icon: 'request_quote', permiso: 'RRHH_LIQUIDACION_GENERAR',
            keywords: ['liquidaciones', 'sueldos', 'salarios', 'nomina'],
            action: { component: ListLiquidacionesSueldoComponent, title: 'Liquidaciones sueldo', tabId: 'liquidaciones-sueldo-tab', data: NAV } },
          { id: 'aguinaldos', label: 'Aguinaldos', icon: 'star', permiso: 'RRHH_LIQUIDACION_GENERAR',
            keywords: ['aguinaldos', 'aguinaldo'],
            action: { component: ListAguinaldosComponent, title: 'Aguinaldos', tabId: 'aguinaldos-tab', data: NAV } },
        ],
      },
      {
        id: 'grp-rrhh-config', label: 'Configuración', icon: 'settings',
        children: [
          { id: 'feriados', label: 'Feriados', icon: 'celebration', permiso: 'RRHH_CONFIG_EDITAR', esConfig: true,
            keywords: ['feriados', 'asuetos'],
            action: { component: ListFeriadosComponent, title: 'Feriados', tabId: 'feriados-tab', data: NAV } },
          { id: 'motivos-vale', label: 'Motivos de vale', icon: 'label', permiso: 'RRHH_VALE_CREAR', esConfig: true,
            keywords: ['motivos', 'vale', 'adelanto'],
            action: { component: ListMotivosValeComponent, title: 'Motivos de vale', tabId: 'motivos-vale-tab', data: NAV } },
          { id: 'configuracion-rrhh', label: 'Configuración RRHH', icon: 'tune', permiso: 'RRHH_CONFIG_EDITAR', esConfig: true,
            keywords: ['config', 'rrhh'],
            action: { component: ListConfiguracionRrhhComponent, title: 'Configuracion RRHH', tabId: 'configuracion-rrhh-tab', data: NAV } },
          { id: 'configuracion-facial', label: 'Reconocimiento facial', icon: 'face', permiso: 'RRHH_CONFIG_EDITAR', esConfig: true,
            keywords: ['reconocimiento', 'facial', 'biometria'],
            action: { component: ConfiguracionFacialComponent, title: 'Reconocimiento facial', tabId: 'configuracion-facial-tab', data: NAV } },
        ],
      },
    ],
  },

  // ═══════════════════════════ PERSONAS ═══════════════════════════
  {
    id: 'grp-personas', label: 'Personas', icon: 'groups',
    children: [
      { id: 'personas', label: 'Personas', icon: 'person', permiso: 'PERSONAS_VER',
        keywords: ['personas', 'persona'],
        action: { component: ListPersonasComponent, title: 'Personas', tabId: 'personas-tab', data: NAV } },
      { id: 'usuarios', label: 'Usuarios', icon: 'account_circle', permiso: 'USUARIOS_GESTIONAR',
        keywords: ['usuarios', 'usuario', 'accesos'],
        action: { component: ListUsuariosComponent, title: 'Usuarios', tabId: 'usuarios-tab', data: NAV } },
      { id: 'clientes', label: 'Clientes', icon: 'business', permiso: 'CLIENTES_VER',
        keywords: ['clientes', 'cliente'],
        action: { component: ListClientesComponent, title: 'Clientes', tabId: 'clientes-tab', data: NAV } },
      { id: 'convenios', label: 'Convenios', icon: 'handshake', permiso: 'CLIENTES_VER', esConfig: true,
        keywords: ['convenios', 'convenio'],
        action: { component: ListConveniosComponent, title: 'Convenios', tabId: 'convenios-tab', data: NAV } },
    ],
  },

  // ═══════════════════════════ COMISIONES ═══════════════════════════
  {
    id: 'grp-comisiones', label: 'Comisiones', icon: 'percent',
    children: [
      { id: 'reglas-comision', label: 'Reglas', icon: 'rule', permiso: 'COMISION_REGLA_VER',
        keywords: ['reglas', 'comisiones'],
        action: { component: ListReglasComisionComponent, title: 'Reglas de Comisión', tabId: 'reglas-comision-tab', data: NAV } },
      { id: 'equipos-comision', label: 'Equipos', icon: 'group', permiso: 'COMISION_EQUIPO_GESTIONAR',
        keywords: ['equipos', 'comisiones'],
        action: { component: ListEquiposComisionComponent, title: 'Equipos Comisión', tabId: 'equipos-comision-tab', data: NAV } },
      { id: 'liquidaciones-comision', label: 'Liquidaciones', icon: 'receipt', permiso: 'COMISION_LIQUIDACION_GENERAR',
        keywords: ['liquidaciones', 'comisiones'],
        action: { component: ListLiquidacionesComisionComponent, title: 'Liquidaciones Comisión', tabId: 'liquidaciones-comision-tab', data: NAV } },
    ],
  },

  // ═══════════════════════════ FACTURACIÓN ═══════════════════════════
  {
    id: 'grp-facturacion', label: 'Facturación', icon: 'receipt_long',
    children: [
      { id: 'facturas', label: 'Facturas', icon: 'receipt_long', permiso: 'FACTURACION_VER',
        keywords: ['facturas', 'factura'],
        action: { component: ListFacturasComponent, title: 'Facturas', tabId: 'facturas-tab', data: NAV } },
      { id: 'timbrados', label: 'Timbrados', icon: 'verified', permiso: 'FACTURACION_TIMBRADO_GESTIONAR',
        keywords: ['timbrados', 'timbrado'],
        action: { component: ListTimbradosComponent, title: 'Timbrados', tabId: 'timbrados-tab', data: NAV } },
      { id: 'plantillas-factura', label: 'Plantillas / Diseños', icon: 'design_services', permiso: 'FACTURACION_PLANTILLA_GESTIONAR',
        keywords: ['plantillas', 'disenos', 'diseños'],
        action: { component: ListPlantillasComponent, title: 'Plantillas de factura', tabId: 'plantillas-factura-tab', data: NAV } },
      { id: 'facturacion-config', label: 'Configuración', icon: 'settings', esConfig: true, permiso: 'FACTURACION_CONFIGURAR',
        keywords: ['configuracion', 'facturacion'],
        action: { component: FacturacionConfigComponent, title: 'Config. facturación', tabId: 'facturacion-config-tab', data: NAV } },
    ],
  },

  // ═══════════════════════════ CONFIGURACIÓN (SISTEMA) ═══════════════════════════
  {
    id: 'grp-config', label: 'Configuración', icon: 'settings',
    children: [
      { id: 'configurar-empresa', label: 'Datos de la Empresa', icon: 'business', permiso: 'EMPRESA_CONFIGURAR', esConfig: true,
        keywords: ['datos', 'empresa'],
        action: { component: ConfigurarEmpresaComponent, title: 'Datos de la Empresa', tabId: 'configurar-empresa-tab', data: NAV } },
      { id: 'impresoras', label: 'Impresoras', icon: 'print', permiso: 'IMPRESORAS_GESTIONAR', esConfig: true,
        keywords: ['impresoras', 'impresora', 'tickets'],
        action: { mode: 'dialog', component: PrinterSettingsComponent, title: 'Impresoras', data: {}, dialogConfig: { width: '800px', maxHeight: '90vh' } } },
      { id: 'sectores-impresoras', label: 'Sectores e impresoras', icon: 'device_hub', permiso: 'SECTORES_IMPRESORAS_CONFIGURAR', esConfig: true,
        keywords: ['sectores', 'impresoras'],
        action: { mode: 'dialog', component: SectoresImpresorasSettingsComponent, title: 'Sectores e impresoras', data: {}, dialogConfig: { width: '1000px', maxHeight: '90vh' } } },
      { id: 'dispositivos', label: 'Dispositivos y puntos de venta', icon: 'devices', permiso: 'DISPOSITIVOS_GESTIONAR', esConfig: true,
        keywords: ['dispositivos', 'puntos', 'venta'],
        action: { component: ListDispositivosComponent, title: 'Dispositivos y Puntos de Venta', tabId: 'dispositivos-tab', data: NAV } },
      { id: 'permisos', label: 'Permisos y Roles', icon: 'verified_user', permiso: 'SISTEMA_PERMISO_GESTIONAR', esConfig: true,
        keywords: ['permisos', 'roles', 'seguridad'],
        action: { component: ListPermisosComponent, title: 'Permisos', tabId: 'permisos-tab', data: NAV } },
      { id: 'configuracion-notificaciones', label: 'Notificaciones', icon: 'notifications_active', permiso: 'NOTIFICACIONES_CONFIGURAR', esConfig: true,
        keywords: ['notificaciones', 'config'],
        action: { component: ConfiguracionNotificacionesComponent, title: 'Notificaciones', tabId: 'configuracion-notificaciones-tab', data: NAV } },
      { id: 'musica', label: 'Música ambiental', icon: 'music_note', permiso: 'MUSICA_VER', esConfig: true,
        keywords: ['musica', 'spotify', 'ambiental', 'playlist', 'sonido'],
        action: { component: MusicaComponent, title: 'Música ambiental', tabId: 'musica-tab', data: NAV } },
      { id: 'backup-restore', label: 'Backup y Restauración', icon: 'backup', permiso: 'SISTEMA_BACKUP', esConfig: true,
        keywords: ['backup', 'restauracion', 'respaldo'],
        action: { component: BackupRestoreComponent, title: 'Backup y Restauración', tabId: 'backup-restore-tab', data: NAV } },
      { id: 'ia-config', label: 'Configurar IA', icon: 'auto_awesome', permiso: 'SISTEMA_CONFIGURAR_IA', esConfig: true,
        keywords: ['configurar', 'ia', 'ocr'],
        action: { component: IaConfigComponent, title: 'Configurar IA', tabId: 'ia-config-tab', data: NAV } },
      { id: 'db-config', label: 'Configurar BD', icon: 'storage', permiso: 'SISTEMA_BD_CONFIGURAR', esConfig: true,
        keywords: ['configurar', 'bd', 'base', 'datos'],
        action: { component: DbConfigComponent, title: 'Configurar BD', tabId: 'db-config-tab', data: NAV } },
      { id: 'mode-config', label: 'Modo de operación', icon: 'hub', permiso: 'SISTEMA_MODO_CONFIGURAR', esConfig: true,
        keywords: ['modo', 'operacion', 'standalone', 'server', 'client'],
        action: { component: ModeConfigComponent, title: 'Modo de operacion', tabId: 'mode-config-tab', data: NAV } },
      { id: 'menu-config', label: 'Configuración del menú', icon: 'menu_open', permiso: 'SISTEMA_MENU_CONFIGURAR', esConfig: true,
        keywords: ['menu', 'sidenav', 'buscador', 'navegacion', 'visibilidad', 'orden'],
        action: { component: MenuConfigComponent, title: 'Configuración del menú', tabId: 'menu-config-tab', data: NAV } },
      // Sin permiso: cualquiera cambia SU propia contraseña. Vive en el menú de
      // usuario de la toolbar, acá sólo para que el buscador global lo encuentre.
      { id: 'cambiar-password', label: 'Cambiar mi contraseña', icon: 'password', esConfig: true, enSidenav: false,
        keywords: ['contrasena', 'contraseña', 'password', 'clave', 'cambiar', 'seguridad'],
        action: { mode: 'dialog', component: ForceChangePasswordDialogComponent, title: 'Cambiar mi contraseña',
          data: { modo: 'self' }, dialogConfig: { width: '480px' } } },
    ],
  },
];
