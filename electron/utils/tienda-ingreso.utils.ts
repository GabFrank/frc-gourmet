import { DataSource } from 'typeorm';
import { TiendaOnlineConfig } from '../../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { setWhatsappOverrides } from './whatsapp-sender';
import { getWhatsappToken } from './tienda-secrets.util';

/**
 * Credenciales de ingreso de clientes de la tienda (PLAN-tienda-online F3).
 *
 * Prioridad: lo cargado en «Config Tienda Online» > variables de entorno. Se resuelve una
 * vez al arrancar y después de cada guardado y queda en memoria: el login y `tienda.config`
 * siguen siendo síncronos y no leen el keychain en cada pedido.
 */
let googleClientIdOverride: string | null = null;

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
  });
  googleClientIdOverride = cfg?.googleClientId || null;
}
