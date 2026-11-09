import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { setWhatsappOverrides } from './whatsapp-sender';
import { getWhatsappToken } from './tienda-secrets.util';
import { getEvolutionApiKey } from './notificaciones-secrets.util';
import { ConfiguracionNotificacion } from '../../src/app/database/entities/notificaciones/configuracion-notificacion.entity';

/**
 * Credenciales de ingreso de clientes de la tienda (PLAN-tienda-online F3).
 *
 * Prioridad: lo cargado en «Config Tienda Online» > variables de entorno. Se resuelve una
 * vez al arrancar y después de cada guardado y queda en memoria: el login y `tienda.config`
 * siguen siendo síncronos y no leen el keychain en cada pedido.
 */
let googleClientIdOverride: string | null = null;
// F4 / proveedores: el proveedor activo tiene sus credenciales completas (nunca quedan acá,
// solo el sí/no), su id y los hosts que el storefront acepta para pagar.
// PLAN-tienda-pagos-multi-icpay: puede haber varios prendidos; acá quedan los que tienen sus
// credenciales completas, en el orden de la config.
export interface ProveedorPagoPublico { id: string; nombre: string; etiqueta: string; medio: string; hosts: string[] }
let pagoProveedoresListos: ProveedorPagoPublico[] = [];
const PROVEEDOR_DEFECTO: ProveedorPagoPublico = { id: 'UPAY', nombre: 'uPay', etiqueta: 'Tarjeta — uPay', medio: 'TARJETA', hosts: [] };

/** ¿Se ofrece el pago online a pedidos nuevos? (interruptor + algún proveedor listo) */
export function pagoOnlineOfrecido(cfg: { pagoOnlineActivo?: boolean } | null | undefined): boolean {
  return !!cfg?.pagoOnlineActivo && pagoProveedoresListos.length > 0;
}

/** Proveedores listos para pedidos nuevos (id, textos y hosts permitidos). */
export function proveedoresPagoListos(): ProveedorPagoPublico[] {
  return pagoProveedoresListos;
}

/** El primero de los listos (compat: un storefront viejo que pide «online» sin elegir). */
export function proveedorPagoActivo(): ProveedorPagoPublico {
  return pagoProveedoresListos[0] || PROVEEDOR_DEFECTO;
}

export function getGoogleClientId(): string | null {
  return googleClientIdOverride || process.env['GOOGLE_CLIENT_ID'] || null;
}

// Las cargas se encadenan: dos guardados seguidos no pueden dejar en memoria la lectura vieja.
let cola: Promise<void> = Promise.resolve();

/**
 * Lee la config + el token del keychain y actualiza lo que usan el login y el envío.
 * La promesa devuelta sirve también para esperar la carga inicial.
 */
export function cargarCredencialesTienda(dataSource: DataSource): Promise<void> {
  const siguiente = cola.then(() => leerYAplicar(dataSource));
  cola = siguiente.catch((e) => {
    console.warn('[tienda-ingreso] no se pudieron cargar las credenciales:', e?.message || e);
  });
  return siguiente;
}

/** Espera las cargas pendientes (la inicial incluida). Nunca rechaza. */
export function credencialesTiendaListas(): Promise<void> {
  return cola;
}

async function leerYAplicar(dataSource: DataSource): Promise<void> {
  const cfg = await dataSource.getRepository(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } });
  const token = await getWhatsappToken();
  setWhatsappOverrides({
    token: token || null,
    phoneNumberId: cfg?.whatsappPhoneNumberId || null,
    plantilla: cfg?.whatsappPlantilla || null,
    idioma: cfg?.whatsappIdioma || null,
    // F9: proveedor elegido; Evolution sale de «Configuración de Notificaciones» (la misma
    // instancia y API key que ya usa FRC para los avisos): no hay una segunda credencial.
    proveedor: (cfg as any)?.whatsappProveedor || null,
    ...(await evolutionDeNotificaciones(dataSource)),
    nombreComercio: cfg?.nombreComercio || null,
  });
  googleClientIdOverride = cfg?.googleClientId || null;
  const { proveedoresListos } = await import('../services/pagos-online/pagos-online.service');
  pagoProveedoresListos = (await proveedoresListos(dataSource, cfg))
    .map((p) => ({ id: p.id, nombre: p.nombre, etiqueta: p.etiqueta, medio: p.medio, hosts: p.hosts }));
}

/** Claves de Evolution en `configuracion_notificaciones` (las mismas que usa `notificacion.service`). */
const CLAVE_EVOLUTION_URL = 'NOTIF_EVOLUTION_URL';
const CLAVE_EVOLUTION_INSTANCIA = 'NOTIF_EVOLUTION_INSTANCE';

async function evolutionDeNotificaciones(dataSource: DataSource): Promise<{ evolutionUrl: string | null; evolutionInstancia: string | null; evolutionApiKey: string | null }> {
  try {
    const filas = await dataSource.getRepository(ConfiguracionNotificacion).find();
    const valor = (k: string) => { const f: any = filas.find((x: any) => x.clave === k && x.activo); return f ? String(f.valor || '').trim() || null : null; };
    return {
      evolutionUrl: valor(CLAVE_EVOLUTION_URL),
      evolutionInstancia: valor(CLAVE_EVOLUTION_INSTANCIA),
      evolutionApiKey: (await getEvolutionApiKey()) || null,
    };
  } catch {
    return { evolutionUrl: null, evolutionInstancia: null, evolutionApiKey: null };
  }
}

/**
 * F9: la config de Evolution se edita en otra pantalla (Notificaciones); antes de mandar un
 * código o de decir si hay login por WhatsApp se vuelve a leer, para no quedar con la vieja.
 */
// Auditoría F9: las llamadas públicas (tienda.config, pedir código) no pueden releer la base y el
// keychain en cada request; se refresca a lo sumo cada 30 s, compartiendo la lectura en vuelo.
// Las pantallas de admin y «Probar envío» fuerzan la lectura.
const REFRESCO_MS = 30_000;
let ultimoRefresco = 0;
let refrescoEnVuelo: Promise<void> | null = null;
export async function refrescarCredencialesWhatsapp(dataSource: DataSource, forzar = false): Promise<void> {
  if (!forzar && Date.now() - ultimoRefresco < REFRESCO_MS) return;
  if (refrescoEnVuelo) return refrescoEnVuelo;
  // Un error transitorio (base, keychain) no puede tumbar la carta ni el pedido de código:
  // se sigue con las credenciales que había.
  refrescoEnVuelo = cargarCredencialesTienda(dataSource)
    .then(() => { ultimoRefresco = Date.now(); })
    .catch((e) => { console.error('[tienda-ingreso] no se pudieron releer las credenciales:', (e as Error)?.message); })
    .finally(() => { refrescoEnVuelo = null; });
  return refrescoEnVuelo;
}
