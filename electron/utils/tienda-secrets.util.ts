/**
 * Token de WhatsApp Cloud de la tienda online en keytar (almacén seguro del SO).
 * Mismo patrón que notificaciones-secrets.util / jwt-secret.utils (PLAN-tienda-online F3).
 *
 * NUNCA se persiste en la BD ni vuelve al cliente o a la API RPC: los handlers solo
 * devuelven «configurado sí/no». Si keytar no está disponible el token no se guarda en
 * texto plano: la pantalla lo avisa y siguen rigiendo las variables de entorno.
 */
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const ACCOUNT_WHATSAPP_TOKEN = 'tienda-whatsapp-cloud-token';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[tienda-secrets] keytar no disponible:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

/** Hay almacén seguro donde guardar el token. */
export function almacenSeguroDisponible(): boolean {
  return !!loadKeytar();
}

export async function getWhatsappToken(): Promise<string> {
  const k = loadKeytar();
  if (!k) return '';
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, ACCOUNT_WHATSAPP_TOKEN)) || '';
  } catch (e) {
    console.warn('[tienda-secrets] error leyendo keychain:', (e as Error).message);
    return '';
  }
}

/** Guarda (o borra, con '') el token. Devuelve false si no se pudo persistir. */
export async function setWhatsappToken(value: string): Promise<boolean> {
  const k = loadKeytar();
  if (!k) return false;
  try {
    if (value) await k.setPassword(KEYCHAIN_SERVICE, ACCOUNT_WHATSAPP_TOKEN, value);
    else await k.deletePassword(KEYCHAIN_SERVICE, ACCOUNT_WHATSAPP_TOKEN);
    return true;
  } catch (e) {
    console.warn('[tienda-secrets] error guardando en keychain:', (e as Error).message);
    return false;
  }
}
