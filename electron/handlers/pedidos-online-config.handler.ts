import { ipcMain } from 'electron';
import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { getVariacionConfig } from '../utils/variacion-config.utils';
import { ensurePermission } from '../utils/auth.utils';
import { registerPublicOperation } from '../server/public-routes';

/**
 * Config de la tienda online — cierre MVP.
 *
 * `tienda.config` (público): el storefront lee apertura, tipos de pedido,
 * prep-time, mínimo y branding. `update-tienda-online-config` (admin) la edita.
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */

const PERM = 'PEDIDOS_ONLINE_CONFIGURAR';

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

/**
 * Config de multi-sabor para que el storefront cotice "mitad y mitad" igual que
 * el mostrador. Si se pasa el producto, se respeta su override
 * (`max_variaciones_simultaneas` / `estrategia_precio_variacion`); si no, rige
 * el global del PdV. Defaults seguros si no hay fila.
 */
export async function getPizzaConfig(
  dataSource: DataSource,
  producto?: Producto | number | null,
): Promise<{ maxSabores: number; estrategia: 'MAYOR_PRECIO' | 'PROMEDIO' }> {
  const cfg = await getVariacionConfig(dataSource, producto ?? null);
  return { maxSabores: cfg.maxSabores, estrategia: cfg.estrategia };
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
    permiteMesa: cfg.permiteMesa,
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
    // Canal MESA_QR (pedidos en mesa por QR)
    if (data.permiteMesa !== undefined) cfg.permiteMesa = !!data.permiteMesa;
    if (data.requiereLanMesa !== undefined) cfg.requiereLanMesa = !!data.requiereLanMesa;
    if (data.rangoLanMesa !== undefined) cfg.rangoLanMesa = data.rangoLanMesa ? String(data.rangoLanMesa).trim() : undefined;
    const saved = await repo.save(cfg);
    return { success: true, config: { ...saved, abiertaAhora: estaAbierta(saved) } };
  });

  registerPublicOperation('tienda.config', {
    channel: 'get-tienda-online-config-public',
    requiresAuth: false,
    description: 'Config pública de la tienda (apertura, tipos, mínimo, branding).',
  });
}
