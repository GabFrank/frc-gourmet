import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { ensurePermission } from '../utils/auth.utils';
import { registerPublicOperation } from '../server/public-routes';

/**
 * Config de la tienda online — cierre MVP.
 *
 * `tienda.config` (público): el storefront lee apertura, tipos de pedido,
 * prep-time, mínimo y branding. `update-tienda-online-config` (admin) la edita.
 * Ver docs/arquitectura/webapp-pedidos-plan.md.
 */

const PERM = 'VENTAS_PDV';

/** Get-or-create de la fila única de config. */
export async function getTiendaConfig(dataSource: DataSource): Promise<TiendaOnlineConfig> {
  const repo = dataSource.getRepository(TiendaOnlineConfig);
  let cfg = await repo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) {
    cfg = await repo.save(repo.create({ activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30 }));
  }
  return cfg;
}

/** ¿Está abierta ahora? activa + (sin horarios = siempre) o dentro de la franja de hoy. */
export function estaAbierta(cfg: TiendaOnlineConfig, now: Date = new Date()): boolean {
  if (!cfg.activa) return false;
  let horarios: any[] = [];
  try {
    horarios = cfg.horariosJson ? JSON.parse(cfg.horariosJson) : [];
  } catch {
    horarios = [];
  }
  if (!Array.isArray(horarios) || horarios.length === 0) return true;
  const dia = now.getDay(); // 0=Dom
  const hoy = horarios.find((h) => Number(h?.dia) === dia && h?.activo);
  if (!hoy) return false;
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const abre = String(hoy.abre || '00:00');
  const cierra = String(hoy.cierra || '23:59');
  // Soporta franjas que cruzan la medianoche (ej. abre 20:00, cierra 02:00).
  if (abre > cierra) return hhmm >= abre || hhmm <= cierra;
  return hhmm >= abre && hhmm <= cierra;
}

function mapConfigPublic(cfg: TiendaOnlineConfig): any {
  return {
    activa: cfg.activa,
    abiertaAhora: estaAbierta(cfg),
    nombreComercio: cfg.nombreComercio ?? null,
    mensajeBienvenida: cfg.mensajeBienvenida ?? null,
    colorPrimario: cfg.colorPrimario ?? null,
    permitePickup: cfg.permitePickup,
    permiteDelivery: cfg.permiteDelivery,
    prepTimeMinutos: cfg.prepTimeMinutos,
    montoMinimoPedido: Number(cfg.montoMinimoPedido),
    // Client ID de Google OAuth (env). Si está, el storefront muestra el botón.
    googleClientId: process.env['GOOGLE_CLIENT_ID'] || null,
  };
}

export function registerPedidosOnlineConfigHandlers(
  dataSource: DataSource,
  getCurrentUser: () => any,
): void {
  // Público: el storefront lee la config.
  ipcMain.handle('get-tienda-online-config-public', async () => {
    return mapConfigPublic(await getTiendaConfig(dataSource));
  });

  // Admin: leer la config completa (para la pantalla).
  ipcMain.handle('get-tienda-online-config', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const cfg = await getTiendaConfig(dataSource);
    return { ...cfg, abiertaAhora: estaAbierta(cfg) };
  });

  // Admin: actualizar.
  ipcMain.handle('update-tienda-online-config', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(TiendaOnlineConfig);
    const cfg = await getTiendaConfig(dataSource);
    if (data.activa !== undefined) cfg.activa = !!data.activa;
    if (data.nombreComercio !== undefined) cfg.nombreComercio = data.nombreComercio ? String(data.nombreComercio).toUpperCase() : undefined;
    if (data.mensajeBienvenida !== undefined) cfg.mensajeBienvenida = data.mensajeBienvenida || undefined;
    if (data.colorPrimario !== undefined) {
      const c = String(data.colorPrimario || '').trim();
      // Solo hex válido (#rgb / #rrggbb); si no, se ignora para no romper el branding.
      if (!c) cfg.colorPrimario = undefined;
      else if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c)) cfg.colorPrimario = c;
      else return { success: false, error: 'color_invalido' };
    }
    if (data.permitePickup !== undefined) cfg.permitePickup = !!data.permitePickup;
    if (data.permiteDelivery !== undefined) cfg.permiteDelivery = !!data.permiteDelivery;
    if (data.prepTimeMinutos !== undefined) cfg.prepTimeMinutos = Number(data.prepTimeMinutos) || 0;
    if (data.montoMinimoPedido !== undefined) cfg.montoMinimoPedido = Number(data.montoMinimoPedido) || 0;
    if (data.aceptacionAutomatica !== undefined) cfg.aceptacionAutomatica = !!data.aceptacionAutomatica;
    if (data.horariosJson !== undefined) cfg.horariosJson = data.horariosJson || undefined;
    const saved = await repo.save(cfg);
    return { success: true, config: { ...saved, abiertaAhora: estaAbierta(saved) } };
  });

  registerPublicOperation('tienda.config', {
    channel: 'get-tienda-online-config-public',
    requiresAuth: false,
    description: 'Config pública de la tienda (apertura, tipos, mínimo, branding).',
  });
}
