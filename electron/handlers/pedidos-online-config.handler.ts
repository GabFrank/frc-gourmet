import { ipcMain } from 'electron';
import { pagoOnlineOfrecido, proveedorPagoActivo, proveedoresPagoListos } from '../utils/tienda-ingreso.utils';
import { metodosAlRecibir } from '../utils/pago-pedido.utils';
import { creditoHabilitadoEnTienda } from '../utils/credito-tienda.utils';
import { METODOS_AL_RECIBIR, MetodoPagoOnline } from '../../src/app/database/entities/pedidos-online/pedido-online.enums';
import { upayConfigDe, apiKey as upayApiKeyActual } from '../services/pagos-online/pagos-online.service';
import { upayProveedor } from '../services/pagos-online/proveedores/upay.proveedor';
import { fetchActual } from '../services/pagos-online/proveedores/deps';
import { listarProveedores, proveedorPorId } from '../services/pagos-online/proveedores';
import { proveedorActivo, urlPublicaTienda } from '../services/pagos-online/pagos-online.service';
import { cuentasListas, listarFormasPago } from '../services/pagos-online/cuentas-pago';
import { leerPagoConfigJson, secretoProveedor, validarCampo, valoresProveedor } from '../services/pagos-online/proveedores/config-proveedor';
import { setSecretoPago } from '../utils/tienda-secrets.util';
import { evolutionConfigurado, otpWhatsappDisponible, proveedorWhatsappActivo, sendWhatsappOtp, whatsappCloudConfigurado, whatsappConfigurado } from '../utils/whatsapp-sender';
import { cargarCredencialesTienda, credencialesTiendaListas, getGoogleClientId, refrescarCredencialesWhatsapp } from '../utils/tienda-ingreso.utils';
import { almacenSeguroDisponible, getWhatsappToken, setWhatsappToken, getUpayApiKey, setUpayApiKey } from '../utils/tienda-secrets.util';
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
    // F9: para «Llamar al local» / «Escribir al local» en el detalle del pedido.
    telefonoContacto: (cfg as any).telefonoContacto ?? null,
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
    // F4: «Pagar con tarjeta» solo con el interruptor y las credenciales del proveedor cargadas.
    pagoOnline: pagoOnlineOfrecido(cfg),
    // Proveedores: con cuál se paga y desde qué hosts el storefront acepta ir o cargar su script.
    pagoOnlineProveedor: pagoOnlineOfrecido(cfg) ? proveedorPagoActivo().id : null,
    // Varios a la vez (Bancard, dinelco, IC Pay): el cliente elige en el checkout.
    pagoOnlineProveedores: pagoOnlineOfrecido(cfg)
      ? proveedoresPagoListos().map((p) => ({ formaId: p.formaId, id: p.id, etiqueta: p.etiqueta, medio: p.medio, pickup: p.pickup, delivery: p.delivery }))
      : [],
    pagoOnlineHosts: pagoOnlineOfrecido(cfg) ? Array.from(new Set(proveedoresPagoListos().flatMap((p) => p.hosts))) : [],
    // F8: métodos para pagar al recibir / retirar (sin configurar = sólo efectivo).
    metodosPago: metodosAlRecibir(cfg),
    // F8b: la tienda ofrece «A cuenta». Si ESTE cliente puede, lo dice `pub-cliente-me`.
    compraACuenta: creditoHabilitadoEnTienda(cfg),
  };
}

/**
 * Estado del ingreso de clientes para la pantalla (F3). Nunca devuelve el token: solo si
 * está cargado y de dónde sale cada valor.
 */
async function estadoIngreso(cfgActual?: TiendaOnlineConfig | null): Promise<any> {
  const tokenGuardado = !!(await getWhatsappToken());
  return {
    almacenSeguroDisponible: almacenSeguroDisponible(),
    whatsappTokenGuardado: tokenGuardado,
    whatsappTokenEnEntorno: !!process.env['WHATSAPP_CLOUD_TOKEN'],
    whatsappPhoneNumberIdEnEntorno: !!process.env['WHATSAPP_PHONE_NUMBER_ID'],
    whatsappConfigurado: whatsappCloudConfigurado(),
    // F9: proveedor de WhatsApp para los códigos.
    whatsappProveedor: (cfgActual as any)?.whatsappProveedor || 'META',
    evolutionConfigurado: evolutionConfigurado(),
    whatsappProveedorActivo: proveedorWhatsappActivo(),
    // ¿Sale algún código? (el elegido o, si no está configurado, el otro).
    whatsappListo: whatsappConfigurado(),
    googleClientIdEnEntorno: !!process.env['GOOGLE_CLIENT_ID'],
    googleConfigurado: !!getGoogleClientId(),
    // F4: solo si la API Key de uPay está guardada (nunca su valor).
    upayApiKeyGuardada: !!(await getUpayApiKey()),
  };
}

/**
 * Proveedores de pago para la pantalla: cuál está activo, qué campos pide cada uno, sus valores NO
 * secretos y, de los secretos, solo si están guardados.
 */
async function estadoProveedoresPago(cfg: TiendaOnlineConfig | null): Promise<any> {
  const lista = [];
  for (const prov of listarProveedores()) {
    const secretosGuardados: Record<string, boolean> = {};
    for (const c of prov.campos.filter((x) => x.secreto)) secretosGuardados[c.clave] = !!(await secretoProveedor(prov.id, c.clave));
    lista.push({
      id: prov.id,
      nombre: prov.nombre,
      etiqueta: prov.etiqueta,
      campos: prov.campos,
      valores: valoresProveedor(cfg, prov),
      secretosGuardados,
      devuelvePorApi: !!prov.devolver,
      // Lo que hay que cargar en el portal del proveedor (p. ej. la URL de confirmación de Bancard).
      datosPortal: prov.datosPortal ? prov.datosPortal(urlPublicaTienda()) : [],
      listo: !!(await prov.credenciales(null as any, cfg)),
    });
  }
  // Con cuentas cargadas (`formas_pago_online`) la pantalla las maneja aparte; esto queda como
  // catálogo de proveedores (campos) y para la config de antes.
  return { proveedorActivo: proveedorActivo(cfg).id, proveedores: lista };
}

/**
 * Aplica proveedor activo, datos por proveedor y devolución automática. Los secretos se validan
 * acá y se devuelven para escribirlos en el almacén DESPUÉS de guardar la fila.
 */
async function aplicarProveedoresPago(
  cfg: TiendaOnlineConfig, data: any,
): Promise<{ error: string } | { secretos: { prov: string; clave: string; valor: string }[] }> {
  if (data.pagoProveedor !== undefined) {
    const v = String(data.pagoProveedor ?? '').trim().toUpperCase();
    if (v && !proveedorPorId(v)) return { error: 'pago_proveedor_invalido' };
    cfg.pagoProveedor = v || null;
  }
  if (data.pagoDevolucionAutomatica !== undefined) cfg.pagoDevolucionAutomatica = !!data.pagoDevolucionAutomatica;
  const todo = leerPagoConfigJson(cfg);
  if (data.pagoConfig && typeof data.pagoConfig === 'object') {
    for (const [id, valores] of Object.entries<any>(data.pagoConfig)) {
      const prov = proveedorPorId(id);
      if (!prov || !valores || typeof valores !== 'object') return { error: 'pago_proveedor_invalido' };
      const actual = { ...(todo[prov.id] || {}) };
      for (const c of prov.campos.filter((x) => !x.secreto)) {
        if (valores[c.clave] === undefined) continue;
        const v = String(valores[c.clave] ?? '').trim();
        const err = validarCampo(prov, c, v);
        if (err) return { error: err };
        if (v) actual[c.clave] = v; else delete actual[c.clave];
      }
      todo[prov.id] = actual;
    }
    cfg.pagoConfigJson = JSON.stringify(todo);
  }
  const secretos: { prov: string; clave: string; valor: string }[] = [];
  const cargar = (bloque: any, borrar: boolean) => {
    if (!bloque || typeof bloque !== 'object') return null;
    for (const [id, valores] of Object.entries<any>(bloque)) {
      const prov = proveedorPorId(id);
      if (!prov) return 'pago_proveedor_invalido';
      const claves = borrar ? (Array.isArray(valores) ? valores : []) : Object.keys(valores || {});
      for (const clave of claves) {
        const c = prov.campos.find((x) => x.secreto && x.clave === clave);
        if (!c) return 'pago_proveedor_invalido';
        const v = borrar ? '' : String(valores[clave] ?? '').trim();
        if (!borrar && !v) continue;
        const err = validarCampo(prov, c, v);
        if (err) return err;
        secretos.push({ prov: prov.id, clave, valor: v });
      }
    }
    return null;
  };
  const e1 = cargar(data.pagoSecretos, false) || cargar(data.pagoSecretosBorrar, true);
  if (e1) return { error: e1 };
  if (secretos.some((x) => x.valor) && !almacenSeguroDisponible()) return { error: 'almacen_seguro_no_disponible' };
  return { secretos };
}

/** F4: URL base de uPay: https y dominio de uPay (STG o la de producción que den al certificar). */
function esUrlBaseUpay(v: string): boolean {
  try {
    const u = new URL(v);
    const h = u.hostname.toLowerCase();
    return u.protocol === 'https:' && (h === 'upay.com.py' || h.endsWith('.upay.com.py') || h === 'upay.com' || h.endsWith('.upay.com'));
  } catch {
    return false;
  }
}

/** Valida y aplica los campos de pago online (F4). Devuelve el código de error o null. */
function aplicarPagoOnline(cfg: TiendaOnlineConfig, data: any): string | null {
  const campo = (v: any) => String(v ?? '').trim();
  if (data.upayBaseUrl !== undefined) {
    const v = campo(data.upayBaseUrl);
    if (v && !esUrlBaseUpay(v)) return 'upay_url_invalida';
    cfg.upayBaseUrl = v || null;
  }
  if (data.upayMerchantId !== undefined) {
    const v = campo(data.upayMerchantId);
    if (v && !/^[\w-]{1,64}$/.test(v)) return 'upay_merchant_invalido';
    cfg.upayMerchantId = v || null;
  }
  if (data.upayMerchantNombre !== undefined) cfg.upayMerchantNombre = campo(data.upayMerchantNombre).slice(0, 150) || null;
  if (data.minutosAvisoPagadoSinAceptar !== undefined) {
    const n = Math.round(Number(data.minutosAvisoPagadoSinAceptar));
    if (!Number.isFinite(n) || n < 1 || n > 240) return 'minutos_aviso_invalido';
    cfg.minutosAvisoPagadoSinAceptar = n;
  }
  if (data.pagoOnlineActivo !== undefined) cfg.pagoOnlineActivo = !!data.pagoOnlineActivo;
  return null;
}

const RE_PHONE_ID = /^\d{6,30}$/;
const RE_PLANTILLA = /^[a-z0-9_]{1,120}$/;
const RE_IDIOMA = /^[a-z]{2,3}(_[A-Z]{2})?$/;
const RE_GOOGLE_ID = /^[\w-]+\.apps\.googleusercontent\.com$/i;

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
  // F9: proveedor de WhatsApp para los códigos (Evolution se configura en Notificaciones).
  if (data.whatsappProveedor !== undefined) {
    const v = campo(data.whatsappProveedor).toUpperCase();
    if (v && v !== 'META' && v !== 'EVOLUTION') return 'whatsapp_proveedor_invalido';
    (cfg as any).whatsappProveedor = v || null;
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
  // Los handlers que dependen de ellas esperan esta carga (credencialesTiendaListas).
  cargarCredencialesTienda(dataSource).catch(() => undefined);

  // «Probar envío» manda una plantilla paga de Meta: como mucho 1 por minuto por teléfono y
  // 5 por hora en total (en memoria; alcanza para probar y corta un uso en bucle).
  const pruebasEnviadas: Array<{ telefono: string; en: number }> = [];

  // Público: el storefront lee la config.
  ipcMain.handle('get-tienda-online-config-public', async () => {
    await credencialesTiendaListas();
    // F9: Evolution vive en Notificaciones; se relee para que «otpWhatsappDisponible» sea el actual.
    await refrescarCredencialesWhatsapp(dataSource);
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
    await refrescarCredencialesWhatsapp(dataSource, true);
    await credencialesTiendaListas();
    const cfg = await getTiendaConfig(dataSource);
    // metodosPago va como lista (en la base es JSON en texto).
    return { ...cfg, metodosPago: metodosAlRecibir(cfg), creditoTienda: creditoHabilitadoEnTienda(cfg), abiertaAhora: estaAbierta(cfg), ingreso: await estadoIngreso(cfg), pago: await estadoProveedoresPago(cfg) };
  });

  // Admin: actualizar.
  ipcMain.handle('update-tienda-online-config', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const repo = dataSource.getRepository(TiendaOnlineConfig);
    const cfg = await getTiendaConfig(dataSource);
    if (data.activa !== undefined) cfg.activa = !!data.activa;
    if (data.telefonoContacto !== undefined) {
      // Sólo dígitos, espacios, + y guiones: va a un enlace tel:/wa.me de la tienda.
      const t = data.telefonoContacto == null ? '' : String(data.telefonoContacto).trim();
      if (t && !/^\+?[0-9][0-9 \-]{5,28}$/.test(t)) return { success: false, error: 'telefono_contacto_invalido' };
      (cfg as any).telefonoContacto = t || null;
    }
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
    if (data.personalizarSabores !== undefined) cfg.personalizarSabores = !!data.personalizarSabores;
    // F8: métodos al recibir. Sólo los conocidos; vacío = sólo efectivo (nunca una tienda sin forma de pago).
    // F8b: «A cuenta» viaja aparte (`creditoTienda`) pero se guarda en la misma lista.
    if (data.metodosPago !== undefined || data.creditoTienda !== undefined) {
      const lista = data.metodosPago !== undefined
        ? (Array.isArray(data.metodosPago) ? data.metodosPago.map((m: any) => String(m).toUpperCase()) : [])
        : metodosAlRecibir(cfg);
      const validos: string[] = METODOS_AL_RECIBIR.filter((m) => lista.includes(m));
      const credito = data.creditoTienda !== undefined ? !!data.creditoTienda : creditoHabilitadoEnTienda(cfg);
      cfg.metodosPago = JSON.stringify([...(validos.length ? validos : [MetodoPagoOnline.EFECTIVO]), ...(credito ? [MetodoPagoOnline.CREDITO] : [])]);
    }
    if (data.horariosJson !== undefined) cfg.horariosJson = data.horariosJson || undefined;
    // Canal MESA_QR (pedidos en mesa por QR)
    if (data.permiteMesa !== undefined) cfg.permiteMesa = !!data.permiteMesa;
    if (data.requiereLanMesa !== undefined) cfg.requiereLanMesa = !!data.requiereLanMesa;
    if (data.rangoLanMesa !== undefined) cfg.rangoLanMesa = data.rangoLanMesa ? String(data.rangoLanMesa).trim() : undefined;
    // Ingreso de clientes (F3)
    const errIngreso = aplicarIngreso(cfg, data);
    if (errIngreso) return { success: false, error: errIngreso };
    // Pago online (F4). La API Key, como el token: solo escritura y al almacén seguro.
    const errPago = aplicarPagoOnline(cfg, data);
    if (errPago) return { success: false, error: errPago };
    const upayKeyNueva = data.upayApiKey !== undefined ? String(data.upayApiKey).trim() : '';
    if (upayKeyNueva && !data.upayApiKeyBorrar && !almacenSeguroDisponible()) {
      return { success: false, error: 'almacen_seguro_no_disponible' };
    }
    // Proveedores de pago (activo, datos por proveedor, devolución automática).
    const resProv = await aplicarProveedoresPago(cfg, data);
    if ('error' in resProv) return { success: false, error: resProv.error };
    const hayCuentas = (await listarFormasPago(dataSource)).length > 0;
    if (cfg.pagoOnlineActivo && hayCuentas) {
      // Con cuentas: al menos una activa y con sus datos completos.
      if (!(await cuentasListas(dataSource, cfg)).length) return { success: false, error: 'pago_sin_proveedor' };
    } else if (cfg.pagoOnlineActivo) {
      // Sin cuentas (lo de antes): el proveedor elegido tiene que estar completo, contando lo que se
      // está guardando ahora (los secretos todavía no se escribieron).
      for (const activo of [proveedorActivo(cfg)]) {
        if (activo.id === upayProveedor.id) {
          const keyFinal = data.upayApiKeyBorrar ? '' : upayKeyNueva || (await upayApiKeyActual());
          if (!cfg.upayMerchantId || !keyFinal) return { success: false, error: 'upay_faltan_credenciales' };
          continue;
        }
        const valores = valoresProveedor(cfg, activo);
        for (const c of activo.campos.filter((x) => x.requerido)) {
          const nuevo = resProv.secretos.find((x) => x.prov === activo.id && x.clave === c.clave);
          const borrado = Array.isArray(data.pagoSecretosBorrar?.[activo.id]) && data.pagoSecretosBorrar[activo.id].includes(c.clave);
          const tiene = c.secreto ? (nuevo ? !!nuevo.valor : !borrado && !!(await secretoProveedor(activo.id, c.clave))) : !!valores[c.clave];
          if (!tiene) return { success: false, error: 'pago_faltan_credenciales', proveedor: activo.id, detalle: `${activo.nombre}: ${c.etiqueta}` };
        }
      }
    }
    // Token: solo escritura. Se manda para cambiarlo; `whatsappTokenBorrar` lo quita.
    // Se valida antes y se escribe en el keychain después de guardar la fila, así un error
    // al guardar no deja el token cambiado.
    const tokenNuevo = data.whatsappToken !== undefined ? String(data.whatsappToken).trim() : '';
    if (tokenNuevo && !data.whatsappTokenBorrar && !almacenSeguroDisponible()) {
      return { success: false, error: 'almacen_seguro_no_disponible' };
    }
    const saved = await repo.save(cfg);
    let tokenOk = true;
    if (data.whatsappTokenBorrar) tokenOk = await setWhatsappToken('');
    else if (tokenNuevo) tokenOk = await setWhatsappToken(tokenNuevo);
    if (data.upayApiKeyBorrar) tokenOk = (await setUpayApiKey('')) && tokenOk;
    else if (upayKeyNueva) tokenOk = (await setUpayApiKey(upayKeyNueva)) && tokenOk;
    for (const x of resProv.secretos) tokenOk = (await setSecretoPago(x.prov, x.clave, x.valor)) && tokenOk;
    await cargarCredencialesTienda(dataSource);
    if (!tokenOk) return { success: false, error: 'token_no_guardado' };
    return { success: true, config: { ...saved, metodosPago: metodosAlRecibir(saved), creditoTienda: creditoHabilitadoEnTienda(saved), abiertaAhora: estaAbierta(saved), ingreso: await estadoIngreso(saved), pago: await estadoProveedoresPago(saved) } };
  });

  // Admin: prueba la conexión con uPay (F4) consultando una sesión que no existe: 404 = la
  // API Key es válida; 401/403 = rechazada. No crea nada ni cobra.
  ipcMain.handle('probar-tienda-upay', async () => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const u = await upayConfigDe(dataSource);
    if (!u) return { success: false, error: 'upay_faltan_credenciales' };
    const r = await upayProveedor.probarConexion(u, { fetch: fetchActual() });
    return r.ok ? { success: true } : { success: false, error: r.error, ...(r.detalle ? { detalle: r.detalle } : {}) };
  });

  // Admin: prueba la conexión con un proveedor de pago (el activo si no se indica). No cobra.
  ipcMain.handle('probar-tienda-pago', async (_event: any, proveedorId?: string) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    const cfg = await getTiendaConfig(dataSource);
    const prov = proveedorId ? proveedorPorId(proveedorId) : proveedorActivo(cfg);
    if (!prov) return { success: false, error: 'pago_proveedor_invalido' };
    const creds = await prov.credenciales(dataSource, cfg);
    if (!creds) return { success: false, error: prov.id === upayProveedor.id ? 'upay_faltan_credenciales' : 'pago_faltan_credenciales' };
    const r = await prov.probarConexion(creds, { fetch: fetchActual() });
    return r.ok ? { success: true, proveedor: prov.nombre, ...(r.detalle ? { detalle: r.detalle } : {}) } : { success: false, error: r.error, proveedor: prov.nombre, ...(r.detalle ? { detalle: r.detalle } : {}) };
  });

  // Admin: manda un código de prueba por WhatsApp con las credenciales vigentes (F3).
  // Solo canal real: sin credenciales no usa el fallback de desarrollo.
  ipcMain.handle('probar-tienda-whatsapp', async (_event: any, data: any) => {
    await ensurePermission(dataSource, getCurrentUser, PERM);
    await refrescarCredencialesWhatsapp(dataSource, true);
    if (!whatsappConfigurado()) return { success: false, error: 'whatsapp_no_configurado' };
    const telefono = String(data?.telefono ?? '').replace(/\D/g, '');
    if (telefono.length < 8 || telefono.length > 15) return { success: false, error: 'telefono_invalido' };
    const ahora = Date.now();
    while (pruebasEnviadas.length && ahora - pruebasEnviadas[0].en > 3_600_000) pruebasEnviadas.shift();
    if (pruebasEnviadas.length >= 5 || pruebasEnviadas.some((p) => p.telefono === telefono && ahora - p.en < 60_000)) {
      return { success: false, error: 'demasiadas_pruebas' };
    }
    pruebasEnviadas.push({ telefono, en: ahora });
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
