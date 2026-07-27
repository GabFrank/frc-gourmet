import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission } from '../utils/auth.utils';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';
import { buildEvolutionConfig } from '../services/notificacion.service';
import { getEvolutionApiKey } from '../utils/notificaciones-secrets.util';
import { sendWhatsappMedia, normalizeWhatsappNumber } from '../services/whatsapp.service';
import { construirReporteVentasCierre } from './reportes-ventas.helper';
import { construirReporteFinanzasCierre } from './reportes-finanzas.helper';

const REPORTE_PERMS = ['VENTAS_REPORTES_VER', 'FINANCIERO_REPORTES_VER'];

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

  // Envía una imagen del reporte (gráfico principal en PNG base64) + caption con
  // los KPIs al WhatsApp configurado (reusa la config/destino del cierre de caja
  // y la conexión Evolution API de Notificaciones).
  ipcMain.handle('enviar-reporte-whatsapp', async (
    _event,
    params: { base64: string; caption?: string; fileName?: string; destino?: string },
  ) => {
    await ensurePermission(dataSource, getCurrentUser, REPORTE_PERMS);
    if (!params?.base64) throw new Error('Imagen del reporte vacía');
    const cfg = await dataSource.getRepository(PdvConfig).findOne({ where: {} });
    const destinoRaw = (params.destino || cfg?.whatsappCierreCajaDestino || '').trim();
    if (!destinoRaw) return { ok: false, omitido: 'Sin destino de WhatsApp configurado (Config PdV)' };
    const evolution = await buildEvolutionConfig();
    const apikey = await getEvolutionApiKey();
    if (!evolution.url || !evolution.instance || !apikey) {
      return { ok: false, omitido: 'Evolution API no configurada (Notificaciones)' };
    }
    const destino = normalizeWhatsappNumber(destinoRaw);
    await sendWhatsappMedia(evolution, apikey, destino, params.base64, {
      fileName: params.fileName || 'reporte.png',
      caption: params.caption || '',
    });
    return { ok: true, destino };
  });
}
