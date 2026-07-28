/**
 * Fuente ÚNICA de registro de todos los handlers IPC de la app.
 *
 * ⚠️ ESTE ES EL ÚNICO LISTADO DE HANDLERS. `main.ts` NO tiene su propia lista:
 * llama a `registerAllAppHandlers(...)`. Los scripts de test E2E
 * (`test-server-standalone.ts`, `test-permissions-e2e.ts`) también la llaman.
 *
 * → Para agregar un handler nuevo: agregá su `registerXHandlers(...)` acá y
 *   listo. Fluye a la app real Y a los tests. NO existe una segunda lista que
 *   sincronizar (esa duplicación era la causa del bug "handler no registrado en
 *   handlerRegistry": se agregaba a un lado y no al otro).
 *
 * Esta función registra SOLO handlers (cada uno es un `ipcMain.handle`, sin
 * efectos secundarios en tiempo de registro). Los schedulers, seeds y la
 * migración de arranque quedan en `main.ts` porque son concerns de runtime de
 * la app real, no del registro de canales.
 *
 * Cuando se invoca desde el standalone/permissions test, `ipcMain` está mockeado
 * vía require.cache antes de cargar estos módulos, así que cada `ipcMain.handle`
 * termina escribiendo en `handlerRegistry`.
 */
import { DataSource } from 'typeorm';
import type { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

import { registerPrinterHandlers } from '../handlers/printers.handler';
import { registerPersonasHandlers } from '../handlers/personas.handler';
import { registerAuthHandlers } from '../handlers/auth.handler';
import { registerImageHandlers } from '../handlers/images.handler';
import { registerFilesHandlers } from '../handlers/files.handler';
import { registerQrUploadHandler } from '../handlers/qr-upload.handler';
import { registerAdjuntosHandlers } from '../handlers/adjuntos.handler';
import { registerDocumentosTicketsHandlers } from '../handlers/documentos-tickets.handler';
import { registerSectoresImpresorasHandlers } from '../handlers/sectores-impresoras.handler';
import { registerProductoSectoresHandlers } from '../handlers/producto-sectores.handler';
import { registerProductosHandlers } from '../handlers/productos.handler';
import { registerFinancieroHandlers } from '../handlers/financiero.handler';
import { registerComprasHandlers } from '../handlers/compras.handler';
import { registerSystemHandlers } from '../handlers/system.handler';
import { registerRemoteTunnelHandlers } from '../handlers/remote-tunnel.handler';
import { registerVentasHandlers } from '../handlers/ventas.handler';
import { registerKdsHandlers } from '../handlers/kds.handler';
import { registerRecetasHandlers } from '../handlers/recetas.handler';
import { registerCajaMayorHandlers } from '../handlers/caja-mayor.handler';
import { registerGastosCajaHandlers } from '../handlers/gastos-caja.handler';
import { registerBusquedaGlobalHandlers } from '../handlers/busqueda-global.handler';
import { registerMenuConfigHandlers } from '../handlers/menu-config.handler';
import { registerPdvEgresosHandlers } from '../handlers/pdv-egresos.handler';
import { registerBankingHandlers } from '../handlers/banking.handler';
import { registerCuentasPorPagarHandlers } from '../handlers/cuentas-por-pagar.handler';
import { registerDashboardShortcutsHandlers } from '../handlers/dashboard-shortcuts.handler';
import { registerOnboardingHandlers } from '../handlers/onboarding.handler';
import { registerEmpresaHandlers } from '../handlers/empresa.handler';
import { registerFacturacionHandlers } from '../handlers/facturacion.handler';
import { registerCotizacionMercadoHandlers } from '../handlers/cotizacion-mercado.handler';
import { registerPermissionsHandlers } from '../handlers/permissions.handler';
import { registerConfiguracionRrhhHandlers } from '../handlers/configuracion-rrhh.handler';
import { registerRrhhFuncionariosHandlers } from '../handlers/rrhh-funcionarios.handler';
import { registerFuncionarioDocumentosHandlers } from '../handlers/funcionario-documentos.handler';
import { registerAsistenciasHandlers } from '../handlers/asistencias.handler';
import { registerAsistenciaFacialHandlers } from '../handlers/asistencia-facial.handler';
import { registerFaceModelsHandlers } from '../handlers/face-models.handler';
import { registerFeriadosHandlers } from '../handlers/feriados.handler';
import { registerHorasExtraHandlers } from '../handlers/horas-extra.handler';
import { registerValesHandlers } from '../handlers/vales.handler';
import { registerLiquidacionSueldoHandlers } from '../handlers/liquidacion-sueldo.handler';
import { registerVacacionesHandlers } from '../handlers/vacaciones.handler';
import { registerLiquidacionFinalHandlers } from '../handlers/liquidacion-final.handler';
import { registerComisionesHandlers } from '../handlers/comisiones.handler';
import { registerEquiposComisionHandlers } from '../handlers/equipos-comision.handler';
import { registerCuentasPorCobrarHandlers } from '../handlers/cuentas-por-cobrar.handler';
import { registerMovimientosClienteHandlers } from '../handlers/movimientos-cliente.handler';
import { registerConveniosHandlers } from '../handlers/convenios.handler';
import { registerNotificacionesRrhhHandlers } from '../handlers/notificaciones-rrhh.handler';
import { registerDashboardRrhhHandlers } from '../handlers/dashboard-rrhh.handler';
import { registerReportesRrhhHandlers } from '../handlers/reportes-rrhh.handler';
import { registerDashboardVentasHandlers } from '../handlers/dashboard-ventas.handler';
import { registerDashboardComprasHandlers } from '../handlers/dashboard-compras.handler';
import { registerDashboardProductosHandlers } from '../handlers/dashboard-productos.handler';
import { registerDashboardFinancieroHandlers } from '../handlers/dashboard-financiero.handler';
import { registerDashboardCajaMayorHandlers } from '../handlers/dashboard-caja-mayor.handler';
import { registerReportesHandlers } from '../handlers/reportes.handler';
import { registerPedidosOnlineHandlers } from '../handlers/pedidos-online.handler';
import { registerPedidosOnlineAuthHandlers } from '../handlers/pedidos-online-auth.handler';
import { registerPedidosOnlinePedidosHandlers } from '../handlers/pedidos-online-pedidos.handler';
import { registerPedidosOnlineAdminHandlers } from '../handlers/pedidos-online-admin.handler';
import { registerPedidosOnlineConfigHandlers } from '../handlers/pedidos-online-config.handler';
import { registerMesaQrHandlers } from '../handlers/mesa-qr.handler';
import { registerBackupHandlers } from '../handlers/backup.handler';
import { registerDbConfigHandlers } from '../handlers/db-config.handler';
import { registerAppModeHandlers } from '../handlers/app-mode.handler';
import { registerFacturaImportHandlers } from '../handlers/factura-import.handler';
import { registerNotificacionesConfigHandlers } from '../handlers/notificaciones-config.handler';
import { registerPasswordRecoveryHandlers } from '../handlers/password-recovery.handler';
import { setNotificacionDataSource } from '../services/notificacion.service';

export interface RegisterAllOptions {
  dataSource: DataSource;
  getCurrentUser: () => Usuario | null;
  setCurrentUser: (u: Usuario | null) => void;
}

/**
 * Registra TODOS los handlers IPC de la app, en el mismo orden en que se
 * cargan en producción. Idéntico para la app real (main.ts) y los tests E2E.
 */
export function registerAllAppHandlers(opts: RegisterAllOptions): void {
  const { dataSource, getCurrentUser, setCurrentUser } = opts;

  registerPrinterHandlers(dataSource, getCurrentUser);
  registerPersonasHandlers(dataSource, getCurrentUser);
  registerAuthHandlers(dataSource, getCurrentUser, setCurrentUser);
  registerImageHandlers(dataSource);
  registerFilesHandlers(); // generic file IPCs (save/delete/read/open)
  registerQrUploadHandler(dataSource); // emparejamiento QR -> subida desde la PWA mobile
  registerAdjuntosHandlers(dataSource, getCurrentUser); // CRUD generico de adjuntos polimorficos
  registerDocumentosTicketsHandlers(dataSource, getCurrentUser); // Tickets termicos (comanda multi-sector, venta, recibos, vales, etc.)
  registerSectoresImpresorasHandlers(dataSource, getCurrentUser); // M2M Sector<->Printer con rol (COMANDA/TICKET_VENTA/PRECUENTA)
  registerProductoSectoresHandlers(dataSource, getCurrentUser); // M2M Producto<->Sector (routing comanda por producto)
  registerProductosHandlers(dataSource, getCurrentUser);
  registerFinancieroHandlers(dataSource, getCurrentUser);
  registerComprasHandlers(dataSource, getCurrentUser);
  registerSystemHandlers(); // system handler doesn't need dataSource or user
  registerRemoteTunnelHandlers(); // acceso remoto via cloudflare quick tunnel
  registerVentasHandlers(dataSource, getCurrentUser);
  registerKdsHandlers(dataSource, getCurrentUser); // KDS: comandas en pantalla de cocina (estado por sector)
  registerRecetasHandlers(dataSource, getCurrentUser); // Recetas + Sabores + Variaciones (unificado)
  registerCajaMayorHandlers(dataSource, getCurrentUser); // Caja Mayor + Gastos + Retiros
  registerGastosCajaHandlers(dataSource, getCurrentUser); // Gastos de la caja de venta (PdV)
  registerBusquedaGlobalHandlers(dataSource, getCurrentUser); // Buscador global (menus se buscan en el cliente)
  registerMenuConfigHandlers(dataSource, getCurrentUser); // Config del menu (overrides del ADMIN sobre menu-tree)
  registerPdvEgresosHandlers(dataSource, getCurrentUser); // Vales/compras pagados desde el cajon (PdV)
  registerBankingHandlers(dataSource, getCurrentUser); // CuentasBancarias + MaquinasPos + Acreditaciones
  registerCuentasPorPagarHandlers(dataSource, getCurrentUser); // CompraCategoria + CompraCuota + CuentaPorPagar
  registerDashboardShortcutsHandlers(dataSource, getCurrentUser); // Dashboard Shortcuts personalizables
  registerOnboardingHandlers(dataSource, getCurrentUser); // Onboarding tasks (lista guiada en Home)
  registerEmpresaHandlers(dataSource, getCurrentUser); // Empresa singleton (datos + branding + fiscal)
  registerFacturacionHandlers(dataSource, getCurrentUser); // Facturacion: timbrados, plantillas, facturas
  registerCotizacionMercadoHandlers(); // Scraping de cotizaciones de mercado on-demand
  registerPermissionsHandlers(dataSource, getCurrentUser); // RRHH: Permission + RolePermission
  registerConfiguracionRrhhHandlers(dataSource, getCurrentUser); // RRHH: ConfiguracionRrhh (parametros legales)
  registerRrhhFuncionariosHandlers(dataSource, getCurrentUser); // RRHH Fase 1: Cargos + Funcionarios + Historicos
  registerFuncionarioDocumentosHandlers(dataSource, getCurrentUser); // RRHH Fase 1: Documentos del funcionario (filesystem)
  registerAsistenciasHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Turnos + Asistencias + Penalizaciones
  registerAsistenciaFacialHandlers(dataSource, getCurrentUser); // RRHH: Reconocimiento facial (rostros + fichaje)
  registerFaceModelsHandlers(dataSource, getCurrentUser); // RRHH: Modelos de reconocimiento facial (descarga/serve)
  registerFeriadosHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Feriados
  registerHorasExtraHandlers(dataSource, getCurrentUser); // RRHH Fase 2: Horas extra
  registerValesHandlers(dataSource, getCurrentUser); // RRHH Fase 3: Vales + Adelantos
  registerLiquidacionSueldoHandlers(dataSource, getCurrentUser); // RRHH Fase 4: Liquidacion + Bonos + Aguinaldos
  registerVacacionesHandlers(dataSource, getCurrentUser); // RRHH Fase 5: Vacaciones
  registerLiquidacionFinalHandlers(dataSource, getCurrentUser); // RRHH Fase 5: Liquidacion final
  registerComisionesHandlers(dataSource, getCurrentUser); // RRHH Fase 6: Comisiones
  registerEquiposComisionHandlers(dataSource, getCurrentUser); // RRHH Fase 6: Equipos de comision
  registerCuentasPorCobrarHandlers(dataSource, getCurrentUser); // Fase 7: CuentasPorCobrar
  registerMovimientosClienteHandlers(dataSource, getCurrentUser); // Fase 7: MovimientosCliente
  registerConveniosHandlers(dataSource, getCurrentUser); // Convenios + cobro consolidado
  // RRHH Fase 8
  registerNotificacionesRrhhHandlers(dataSource, getCurrentUser); // Notificaciones RRHH
  registerDashboardRrhhHandlers(dataSource, getCurrentUser); // Dashboard KPIs RRHH
  registerReportesRrhhHandlers(dataSource, getCurrentUser); // Reportes + Exports RRHH

  // Dashboards por dominio (Ventas, Compras, Productos, Financiero, Caja Mayor)
  registerDashboardVentasHandlers(dataSource, getCurrentUser);
  registerDashboardComprasHandlers(dataSource, getCurrentUser);
  registerDashboardProductosHandlers(dataSource, getCurrentUser);
  registerDashboardFinancieroHandlers(dataSource, getCurrentUser);
  registerDashboardCajaMayorHandlers(dataSource, getCurrentUser);

  // Hub de Reportes (cierre de mes): Ventas + Finanzas
  registerReportesHandlers(dataSource, getCurrentUser);

  // Pedidos online (web app): menu publicable + superficie publica /pub
  registerPedidosOnlineHandlers(dataSource, getCurrentUser);
  registerPedidosOnlineAuthHandlers(dataSource, getCurrentUser); // auth de cliente (OTP WhatsApp + password)
  registerPedidosOnlinePedidosHandlers(dataSource, getCurrentUser); // crear pedido + zonas (publico)
  registerPedidosOnlineAdminHandlers(dataSource, getCurrentUser); // bandeja de pedidos en el PdV
  registerPedidosOnlineConfigHandlers(dataSource, getCurrentUser); // config de tienda online
  registerMesaQrHandlers(dataSource, getCurrentUser); // QR de mesa (MESA_QR autoservicio)

  // Backup & Restore
  registerBackupHandlers(dataSource, getCurrentUser);
  // Configuracion de BD (sqlite path / postgres)
  registerDbConfigHandlers(dataSource, getCurrentUser);
  // Modo de operacion (standalone / server / cliente)
  registerAppModeHandlers(dataSource, getCurrentUser);
  // Importacion de facturas con OCR + IA
  registerFacturaImportHandlers(dataSource, getCurrentUser);
  // Notificaciones (Email + WhatsApp): config/receptores/eventos + recuperacion de contrasenha
  setNotificacionDataSource(dataSource);
  registerNotificacionesConfigHandlers(dataSource, getCurrentUser);
  registerPasswordRecoveryHandlers(dataSource, getCurrentUser);
}
