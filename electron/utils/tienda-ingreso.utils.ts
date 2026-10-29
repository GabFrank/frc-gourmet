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

/** Lee la config + el token del keychain y actualiza lo que usan el login y el envío. */
export async function cargarCredencialesTienda(dataSource: DataSource): Promise<void> {
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
