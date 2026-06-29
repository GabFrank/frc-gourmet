/**
 * Registra todos los handlers IPC de la app contra `ipcMain` (o un mock).
 *
 * Comparte el codigo entre `main.ts` (Electron real) y `scripts/test-server-standalone.ts`
 * (server Node sin Electron, para validacion E2E del modo cliente).
 *
 * Cuando se invoca desde el standalone test, el ipcMain esta mockeado via
 * require.cache antes de que estos modulos se carguen, asi que cada
 * `ipcMain.handle(...)` termina escribiendo en `handlerRegistry`.
 */
import { DataSource } from 'typeorm';
import type { Usuario } from '../../src/app/database/entities/personas/usuario.entity';

import { registerPrinterHandlers } from '../handlers/printers.handler';
import { registerPersonasHandlers } from '../handlers/personas.handler';
import { registerAuthHandlers } from '../handlers/auth.handler';
import { registerImageHandlers } from '../handlers/images.handler';
import { registerFilesHandlers } from '../handlers/files.handler';
import { registerAdjuntosHandlers } from '../handlers/adjuntos.handler';
import { registerProductosHandlers } from '../handlers/productos.handler';
import { registerFinancieroHandlers } from '../handlers/financiero.handler';
import { registerComprasHandlers } from '../handlers/compras.handler';
import { registerSystemHandlers } from '../handlers/system.handler';
import { registerVentasHandlers } from '../handlers/ventas.handler';
import { registerRecetasHandlers } from '../handlers/recetas.handler';
import { registerCajaMayorHandlers } from '../handlers/caja-mayor.handler';
import { registerBankingHandlers } from '../handlers/banking.handler';
import { registerCuentasPorPagarHandlers } from '../handlers/cuentas-por-pagar.handler';
import { registerDashboardShortcutsHandlers } from '../handlers/dashboard-shortcuts.handler';
import { registerPermissionsHandlers } from '../handlers/permissions.handler';
import { registerConfiguracionRrhhHandlers } from '../handlers/configuracion-rrhh.handler';
import { registerRrhhFuncionariosHandlers } from '../handlers/rrhh-funcionarios.handler';
import { registerFuncionarioDocumentosHandlers } from '../handlers/funcionario-documentos.handler';
import { registerAsistenciasHandlers } from '../handlers/asistencias.handler';
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
import { registerNotificacionesRrhhHandlers } from '../handlers/notificaciones-rrhh.handler';
import { registerDashboardRrhhHandlers } from '../handlers/dashboard-rrhh.handler';
import { registerReportesRrhhHandlers } from '../handlers/reportes-rrhh.handler';
import { registerDashboardVentasHandlers } from '../handlers/dashboard-ventas.handler';
import { registerDashboardComprasHandlers } from '../handlers/dashboard-compras.handler';
import { registerDashboardProductosHandlers } from '../handlers/dashboard-productos.handler';
import { registerDashboardFinancieroHandlers } from '../handlers/dashboard-financiero.handler';
import { registerDashboardCajaMayorHandlers } from '../handlers/dashboard-caja-mayor.handler';
import { registerBackupHandlers } from '../handlers/backup.handler';
import { registerFacturaImportHandlers } from '../handlers/factura-import.handler';
import { registerEmpresaHandlers } from '../handlers/empresa.handler';
import { registerFacturacionHandlers } from '../handlers/facturacion.handler';
import { registerDbConfigHandlers } from '../handlers/db-config.handler';
import { registerAppModeHandlers } from '../handlers/app-mode.handler';

export interface RegisterAllOptions {
  dataSource: DataSource;
  getCurrentUser: () => Usuario | null;
  setCurrentUser: (u: Usuario | null) => void;
}

export function registerAllAppHandlers(opts: RegisterAllOptions): void {
  const { dataSource, getCurrentUser, setCurrentUser } = opts;

  registerPrinterHandlers(dataSource, getCurrentUser);
  registerPersonasHandlers(dataSource, getCurrentUser);
  registerAuthHandlers(dataSource, getCurrentUser, setCurrentUser);
  registerImageHandlers(dataSource);
  registerFilesHandlers();
  registerAdjuntosHandlers(dataSource, getCurrentUser);
  registerProductosHandlers(dataSource, getCurrentUser);
  registerFinancieroHandlers(dataSource, getCurrentUser);
  registerComprasHandlers(dataSource, getCurrentUser);
  registerSystemHandlers();
  registerVentasHandlers(dataSource, getCurrentUser);
  registerRecetasHandlers(dataSource, getCurrentUser);
  registerCajaMayorHandlers(dataSource, getCurrentUser);
  registerBankingHandlers(dataSource, getCurrentUser);
  registerCuentasPorPagarHandlers(dataSource, getCurrentUser);
  registerDashboardShortcutsHandlers(dataSource, getCurrentUser);
  registerPermissionsHandlers(dataSource, getCurrentUser);
  registerConfiguracionRrhhHandlers(dataSource, getCurrentUser);
  registerRrhhFuncionariosHandlers(dataSource, getCurrentUser);
  registerFuncionarioDocumentosHandlers(dataSource, getCurrentUser);
  registerAsistenciasHandlers(dataSource, getCurrentUser);
  registerFeriadosHandlers(dataSource, getCurrentUser);
  registerHorasExtraHandlers(dataSource, getCurrentUser);
  registerValesHandlers(dataSource, getCurrentUser);
  registerLiquidacionSueldoHandlers(dataSource, getCurrentUser);
  registerVacacionesHandlers(dataSource, getCurrentUser);
  registerLiquidacionFinalHandlers(dataSource, getCurrentUser);
  registerComisionesHandlers(dataSource, getCurrentUser);
  registerEquiposComisionHandlers(dataSource, getCurrentUser);
  registerCuentasPorCobrarHandlers(dataSource, getCurrentUser);
  registerMovimientosClienteHandlers(dataSource, getCurrentUser);
  registerNotificacionesRrhhHandlers(dataSource, getCurrentUser);
  registerDashboardRrhhHandlers(dataSource, getCurrentUser);
  registerReportesRrhhHandlers(dataSource, getCurrentUser);
  registerDashboardVentasHandlers(dataSource, getCurrentUser);
  registerDashboardComprasHandlers(dataSource, getCurrentUser);
  registerDashboardProductosHandlers(dataSource, getCurrentUser);
  registerDashboardFinancieroHandlers(dataSource, getCurrentUser);
  registerDashboardCajaMayorHandlers(dataSource, getCurrentUser);
  registerBackupHandlers(dataSource, getCurrentUser);
  registerDbConfigHandlers(dataSource, getCurrentUser);
  registerAppModeHandlers(dataSource, getCurrentUser);
  registerFacturaImportHandlers(dataSource, getCurrentUser);
  registerEmpresaHandlers(dataSource, getCurrentUser);
  registerFacturacionHandlers(dataSource, getCurrentUser);
}
