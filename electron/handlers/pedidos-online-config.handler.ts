import { ipcMain } from 'electron';
import { otpWhatsappDisponible, sendWhatsappOtp, whatsappCloudConfigurado } from '../utils/whatsapp-sender';
import { cargarCredencialesTienda, getGoogleClientId } from '../utils/tienda-ingreso.utils';
import { almacenSeguroDisponible, getWhatsappToken, setWhatsappToken } from '../utils/tienda-secrets.util';
import { randomInt } from 'crypto';
import { DataSource } from 'typeorm';
import { ZonaDelivery } from '../../src/app/database/entities/pedidos-online/zona-delivery.entity';
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
    // Client ID de Google OAuth (pantalla > env). Si está, el storefront muestra el botón.
    googleClientId: getGoogleClientId(),
    // Login por código de WhatsApp: solo si hay un canal real de envío.
    otpWhatsappDisponible: otpWhatsappDisponible(),
  };
}

/**
 * Estado del ingreso de clientes para la pantalla (F3). Nunca devuelve el token: solo si
 * está cargado y de dónde sale cada valor.
 */
async function estadoIngreso(): Promise<any> {
  const tokenGuardado = !!(await getWhatsappToken());
  return {
    almacenSeguroDisponible: almacenSeguroDisponible(),
    whatsappTokenGuardado: tokenGuardado,
    whatsappTokenEnEntorno: !!process.env['WHATSAPP_CLOUD_TOKEN'],
    whatsappPhoneNumberIdEnEntorno: !!process.env['WHATSAPP_PHONE_NUMBER_ID'],
    whatsappConfigurado: whatsappCloudConfigurado(),
    googleClientIdEnEntorno: !!process.env['GOOGLE_CLIENT_ID'],
    googleConfigurado: !!getGoogleClientId(),
  };
}

const RE_PHONE_ID = /^\d{6,30}$/;
const RE_PLANTILLA = /^[a-z0-9_]{1,120}$/;
const RE_IDIOMA = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const RE_GOOGLE_ID = /^[0-9a-z-]+\.apps\.googleusercontent\.com$/;

/**
 * Valida y aplica los campos de ingreso de clientes. Vacío = se borra el valor y vuelve a
 * regir la variable de entorno. Devuelve el código de error o null.
 */
function aplicarIngreso(cfg: TiendaOnlineConfig, data: any): string | null {
  const campo = (v: any) => String(v ?? '').trim();
  if (data.whatsappPhoneNumberId !== undefined) {
    const v = campo(data.whatsappPhoneNumberId);
    if (v && !RE_PHONE_ID.test(v)) return 'whatsapp_phone_id_invalido';
    cfg.whatsappPhoneNumberId = v || (null as any);
  }
  if (data.whatsappPlantilla !== undefined) {
    const v = campo(data.whatsappPlantilla);
    if (v && !RE_PLANTILLA.test(v)) return 'whatsapp_plantilla_invalida';
    cfg.whatsappPlantilla = v || (null as any);
  }
  if (data.whatsappIdioma !== undefined) {
    const v = campo(data.whatsappIdioma);
    if (v && !RE_IDIOMA.test(v)) return 'whatsapp_idioma_invalido';
    cfg.whatsappIdioma = v || (null as any);
  }
  if (data.googleClientId !== undefined) {
    const v = campo(data.googleClientId);
    if (v && !RE_GOOGLE_ID.test(v)) return 'google_client_id_invalido';
    cfg.googleClientId = v || (null as any);
  }
  return null;
}

export function registerPedidosOnlineConfigHandlers(
  dataSource: DataSource,
  getCurrentUser: () => any,
): void {
  // Credenciales de ingreso cargadas en la app (F3): prioridad sobre las de entorno.
  cargarCredencialesTienda(dataSource).catch((e) =>
    console.warn('[tienda-config] no se pudieron cargar las credenciales de ingreso:', e?.message || e),
  );

  // Público: el storefront lee la config.
  ipcMain.handle('get-tienda-online-config-public', async () => {
    const pub = mapConfigPublic(await getTiendaConfig(dataSource));
    // Delivery solo si hay alguna zona activa dibujada: sin zona no se puede
    // cobrar el envío (PLAN-tienda-online A3).
    if (pub.permiteDelivery) {
      const zonas = await dataSource.getRepository(ZonaDelivery).find({ where: { activa: true } });
      pub.permiteDelivery = zonas.some((z) => !!z.poligono);
    }
    return pub;
  });

  // Admin: leer la config completa (para la pantalla).
  ipcMain.handle('get-tienda-online-config', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const cfg = await getTiendaConfig(dataSource);
    return { ...cfg, abiertaAhora: estaAbierta(cfg), ingreso: await estadoIngreso() };
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
    // Ingreso de clientes (F3)
    const errIngreso = aplicarIngreso(cfg, data);
    if (errIngreso) return { success: false, error: errIngreso };
    // Token: solo escritura. Se manda para cambiarlo; `whatsappTokenBorrar` lo quita.
    if (data.whatsappTokenBorrar) {
      await setWhatsappToken('');
    } else if (data.whatsappToken !== undefined && String(data.whatsappToken).trim()) {
      if (!almacenSeguroDisponible()) return { success: false, error: 'almacen_seguro_no_disponible' };
      const ok = await setWhatsappToken(String(data.whatsappToken).trim());
      if (!ok) return { success: false, error: 'token_no_guardado' };
    }
    const saved = await repo.save(cfg);
    await cargarCredencialesTienda(dataSource);
    return { success: true, config: { ...saved, abiertaAhora: estaAbierta(saved), ingreso: await estadoIngreso() } };
  });

  // Admin: manda un código de prueba por WhatsApp con las credenciales vigentes (F3).
  // Solo canal real: sin credenciales no usa el fallback de desarrollo.
  ipcMain.handle('probar-tienda-whatsapp', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    if (!whatsappCloudConfigurado()) return { success: false, error: 'whatsapp_no_configurado' };
    const telefono = String(data?.telefono ?? '').replace(/\D/g, '');
    if (telefono.length < 8 || telefono.length > 15) return { success: false, error: 'telefono_invalido' };
    const codigo = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const envio = await sendWhatsappOtp(telefono, codigo);
    if (!envio.ok) return { success: false, error: 'envio_fallido', detalle: envio.detail || null };
    return { success: true };
  });

  registerPublicOperation('tienda.config', {
    channel: 'get-tienda-online-config-public',
    requiresAuth: false,
    description: 'Config pública de la tienda (apertura, tipos, mínimo, branding).',
  });
}
