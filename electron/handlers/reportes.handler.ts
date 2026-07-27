import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { construirReporteVentasCierre } from './reportes-ventas.helper';
import { construirReporteFinanzasCierre } from './reportes-finanzas.helper';

/**
 * Parámetros del período para los reportes de cierre de mes.
 * - `rango`: preset ('today' | 'week' | 'month' | 'prevMonth' | 'quarter' | 'custom').
 * - `desde` / `hasta`: ISO, solo cuando `rango === 'custom'`.
 * - `comparar`: si true, el backend calcula además el período anterior (para deltas).
 * - `monedaId`: moneda de presentación (por defecto la principal).
 */
export interface ReportePeriodoParams {
  rango: string;
  desde?: string;
  hasta?: string;
  comparar?: boolean;
  monedaId?: number;
}

/**
 * Handlers del hub de Reportes (cierre de mes). Solo lectura / agregación — no
 * mutan datos, pero exponen inteligencia de negocio agregada, así que van
 * gateados por permiso (`/api/rpc` es default-allow: el guard por-handler es la
 * única frontera real).
 */
export function registerReportesHandlers(
  dataSource: DataSource,
  getCurrentUser: () => Usuario | null,
): void {
  ipcMain.handle('get-reporte-ventas-cierre', async (_event, params: ReportePeriodoParams) => {
    await ensurePermission(dataSource, getCurrentUser, 'VENTAS_REPORTES_VER');
    return construirReporteVentasCierre(dataSource, params || { rango: 'month' });
  });

  ipcMain.handle('get-reporte-finanzas-cierre', async (_event, params: ReportePeriodoParams) => {
    await ensurePermission(dataSource, getCurrentUser, 'FINANCIERO_REPORTES_VER');
    return construirReporteFinanzasCierre(dataSource, params || { rango: 'month' });
  });
}
