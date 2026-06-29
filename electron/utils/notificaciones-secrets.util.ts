/**
 * Secretos del modulo de Notificaciones en keytar (almacen seguro del SO).
 * Mismo patron que db-password.utils / jwt-secret.utils.
 *
 * - SMTP password (envio de email)
 * - Evolution API key (envio de WhatsApp)
 *
 * NUNCA se persisten en la BD ni en JSON en texto plano.
 */
const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const ACCOUNT_SMTP_PASSWORD = 'notif-smtp-password';
const ACCOUNT_EVOLUTION_APIKEY = 'notif-evolution-apikey';

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[notif-secrets] keytar no disponible:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

async function getSecret(account: string): Promise<string> {
  const k = loadKeytar();
  if (!k) return '';
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, account)) || '';
  } catch (e) {
    console.warn('[notif-secrets] error leyendo keychain:', e);
    return '';
  }
}

async function setSecret(account: string, value: string): Promise<void> {
  const k = loadKeytar();
  if (!k) {
    console.warn('[notif-secrets] keytar no disponible — secreto NO persistido.');
    return;
  }
  try {
    if (value) await k.setPassword(KEYCHAIN_SERVICE, account, value);
    else await k.deletePassword(KEYCHAIN_SERVICE, account);
  } catch (e) {
    console.warn('[notif-secrets] error guardando en keychain:', e);
  }
}

export const getSmtpPassword = () => getSecret(ACCOUNT_SMTP_PASSWORD);
export const setSmtpPassword = (v: string) => setSecret(ACCOUNT_SMTP_PASSWORD, v);
export const getEvolutionApiKey = () => getSecret(ACCOUNT_EVOLUTION_APIKEY);
export const setEvolutionApiKey = (v: string) => setSecret(ACCOUNT_EVOLUTION_APIKEY, v);

/** Indica si cada secreto esta configurado (sin exponer el valor). */
export async function getSecretsStatus(): Promise<{ smtpPassword: boolean; evolutionApiKey: boolean }> {
  const [smtp, evo] = await Promise.all([getSmtpPassword(), getEvolutionApiKey()]);
  return { smtpPassword: !!smtp, evolutionApiKey: !!evo };
}
