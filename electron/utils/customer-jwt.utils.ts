/**
 * JWT de CLIENTE (web app de pedidos online) — separado del JWT de staff.
 *
 * Por qué un secret y una audiencia propios:
 *  - El JWT de staff (`jwt-secret.utils` + `@fastify/jwt`) autoriza `/api/rpc`,
 *    que puede invocar cualquiera de los ~700 handlers. Un cliente final NUNCA
 *    debe portar un token capaz de eso.
 *  - Con un secret distinto, un token de cliente forjado/filtrado no sirve para
 *    `/api/rpc` y viceversa. Además marcamos `aud: 'customer'` para rechazar
 *    tokens de otra audiencia aunque el secret coincidiera.
 *
 * Los tokens de cliente solo se aceptan en el namespace público `/pub/*`
 * (ver `electron/server/public-routes.ts`). Usa `jsonwebtoken` (ya es dep),
 * no `@fastify/jwt`, para no entrelazar la verificación con la de staff.
 */
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';

const KEYCHAIN_SERVICE = 'com.frcgourmet.app';
const KEYCHAIN_ACCOUNT = 'customer-jwt-secret';
const FALLBACK_FILE = 'customer-jwt-secret.local';

export const CUSTOMER_JWT_AUDIENCE = 'customer';
export const CUSTOMER_JWT_ISSUER = 'frc-gourmet';
/** TTL del access token de cliente. El refresh (fase 2) lo extiende. */
export const CUSTOMER_ACCESS_TTL = '30m';

export interface CustomerJwtPayload {
  /** id de la CuentaCliente (fase 2). En fase 0 puede ser un placeholder de prueba. */
  sub: number;
  /** teléfono verificado del cliente, para trazabilidad. */
  tel?: string;
  /** id del cliente registrado vinculado (opcional). */
  clienteId?: number | null;
}

let keytarModule: any | undefined;
function loadKeytar(): any | null {
  if (keytarModule !== undefined) return keytarModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    keytarModule = require('keytar');
  } catch (e) {
    console.warn('[customer-jwt] keytar no disponible, fallback filesystem:', (e as Error).message);
    keytarModule = null;
  }
  return keytarModule;
}

let cachedSecret: string | null = null;

async function readFromKeychain(): Promise<string | null> {
  const k = loadKeytar();
  if (!k) return null;
  try {
    return (await k.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)) || null;
  } catch (e) {
    console.warn('[customer-jwt] error leyendo keychain:', e);
    return null;
  }
}

async function writeToKeychain(value: string): Promise<boolean> {
  const k = loadKeytar();
  if (!k) return false;
  try {
    await k.setPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, value);
    return true;
  } catch (e) {
    console.warn('[customer-jwt] error guardando en keychain:', e);
    return false;
  }
}

function fallbackPath(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { app } = require('electron');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');
    return path.join(app.getPath('userData'), FALLBACK_FILE);
  } catch {
    return null;
  }
}

function readFromFile(): string | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const p = fallbackPath();
    if (p && fs.existsSync(p)) return fs.readFileSync(p, 'utf-8').trim() || null;
    return null;
  } catch {
    return null;
  }
}

function writeToFile(value: string): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const p = fallbackPath();
    if (p) fs.writeFileSync(p, value, { encoding: 'utf-8', mode: 0o600 });
  } catch (e) {
    console.warn('[customer-jwt] error guardando fallback file:', e);
  }
}

export async function getCustomerJwtSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;

  let secret = await readFromKeychain();
  if (!secret) secret = readFromFile();

  if (!secret) {
    secret = crypto.randomBytes(48).toString('base64');
    const stored = await writeToKeychain(secret);
    if (!stored) writeToFile(secret);
    console.log('[customer-jwt] secret de cliente generado y persistido.');
  }

  cachedSecret = secret;
  return secret;
}

/** Firma un access token de cliente. */
export async function signCustomerToken(
  payload: CustomerJwtPayload,
  ttl: string = CUSTOMER_ACCESS_TTL,
): Promise<string> {
  const secret = await getCustomerJwtSecret();
  const options: jwt.SignOptions = {
    audience: CUSTOMER_JWT_AUDIENCE,
    issuer: CUSTOMER_JWT_ISSUER,
    // @types/jsonwebtoken v9 tipa expiresIn como `ms.StringValue | number`;
    // un string plano no matchea el tipo literal, casteamos el valor.
    expiresIn: ttl as unknown as number,
  };
  return jwt.sign(
    { sub: payload.sub, tel: payload.tel, clienteId: payload.clienteId ?? null },
    secret,
    options,
  );
}

export interface VerifiedCustomer {
  sub: number;
  tel?: string;
  clienteId?: number | null;
  iat?: number;
  exp?: number;
}

/** Verifica un access token de cliente. Lanza si es inválido/expirado/otra audiencia. */
export async function verifyCustomerToken(token: string): Promise<VerifiedCustomer> {
  const secret = await getCustomerJwtSecret();
  const decoded = jwt.verify(token, secret, {
    audience: CUSTOMER_JWT_AUDIENCE,
    issuer: CUSTOMER_JWT_ISSUER,
  }) as any;
  return {
    sub: typeof decoded.sub === 'string' ? parseInt(decoded.sub, 10) : decoded.sub,
    tel: decoded.tel,
    clienteId: decoded.clienteId ?? null,
    iat: decoded.iat,
    exp: decoded.exp,
  };
}
