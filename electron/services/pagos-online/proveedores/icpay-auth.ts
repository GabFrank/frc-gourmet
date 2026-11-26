/**
 * Sesión con IC Pay (PLAN-tienda-pagos-multi-icpay §3).
 *
 * IC no usa solo una API key: cada llamada lleva además un JWT del usuario «store», que sale del
 * sign-in con email y contraseña (dura 1 h) y se renueva con el refresh token. Los tokens viven en
 * memoria del proceso: nunca se guardan en la base, en logs ni en eventos.
 *
 * - Antes de cada llamada: token vigente con más de 5 min → se usa; si no, refresh; si el refresh
 *   falla, sign-in.
 * - Un 401 en una llamada borra la sesión y reintenta UNA vez con un sign-in nuevo.
 * - Si el sign-in pide un desafío (MFA, contraseña temporal), no hay forma de seguir sin una
 *   persona: error `icpay_mfa`.
 */
import { FetchLike, ProveedorError } from './tipos';

export interface IcpayConfig {
  baseUrl: string;
  email: string;
  apiKey: string;
  password: string;
  /** Moneda en que paga el cliente: BRL (Pix) o USDT (Tron; en staging se paga con una wallet de prueba). */
  moneda: 'BRL' | 'USDT';
}

interface Sesion { access: string; refresh: string | null; venceEn: number }
const sesiones = new Map<string, Sesion>();
const MARGEN_MS = 5 * 60_000;

/** `https://host/api/v1/` → `https://host` (el sandbox se suele copiar con el prefijo de la API). */
export function normalizarBaseIcpay(u: string): string {
  return String(u || '').trim().replace(/\/+$/, '').replace(/\/api\/v1$/i, '').replace(/\/+$/, '');
}

/** Tolera la clave copiada con el nombre de la cabecera («x-api-key: …»). */
export function normalizarApiKey(k: string): string {
  return String(k || '').trim().replace(/^x-api-key\s*:\s*/i, '').trim();
}

const claveSesion = (c: IcpayConfig) => `${c.baseUrl}|${c.email}|${c.apiKey.slice(-6)}`;

/** Solo para tests: olvidar las sesiones. */
export function olvidarSesionesIcpay(): void {
  sesiones.clear();
}

async function pedir(fetch: FetchLike, url: string, init: any): Promise<{ status: number; body: any }> {
  const r = await fetch(url, init);
  const t = await r.text();
  let body: any = null;
  try { body = t ? JSON.parse(t) : null; } catch { body = t; }
  return { status: r.status, body };
}

function guardar(c: IcpayConfig, b: any, refreshAnterior: string | null): Sesion {
  const seg = Number(b?.expiresIn);
  const s: Sesion = { access: String(b.accessToken), refresh: b.refreshToken ? String(b.refreshToken) : refreshAnterior, venceEn: Date.now() + (seg > 0 ? seg : 3600) * 1000 };
  sesiones.set(claveSesion(c), s);
  return s;
}

async function signIn(c: IcpayConfig, fetch: FetchLike): Promise<Sesion> {
  const r = await pedir(fetch, `${c.baseUrl}/api/v1/auth/admin/sign-in`, {
    method: 'POST',
    headers: { 'x-api-key': c.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email: c.email, password: c.password }),
  });
  if (r.status >= 200 && r.status < 300 && r.body?.challengeName) {
    throw new ProveedorError('icpay_mfa', `IC pide un paso más para entrar (${r.body.challengeName}): el usuario tiene MFA o contraseña temporal`);
  }
  if (r.status >= 200 && r.status < 300 && r.body?.accessToken) return guardar(c, r.body, null);
  if (r.status === 400 || r.status === 401 || r.status === 403) throw new ProveedorError('icpay_credenciales', `IC rechazó el usuario o la contraseña (HTTP ${r.status})`, r.status);
  throw new ProveedorError('icpay_error', `IC no respondió al iniciar sesión (HTTP ${r.status})`, r.status);
}

async function refrescar(c: IcpayConfig, fetch: FetchLike, s: Sesion): Promise<Sesion | null> {
  if (!s.refresh) return null;
  try {
    const r = await pedir(fetch, `${c.baseUrl}/api/v1/auth/admin/refresh-session`, {
      method: 'POST',
      headers: { 'x-api-key': c.apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken: s.refresh }),
    });
    return r.status >= 200 && r.status < 300 && r.body?.accessToken ? guardar(c, r.body, s.refresh) : null;
  } catch {
    return null;
  }
}

async function token(c: IcpayConfig, fetch: FetchLike): Promise<string> {
  const s = sesiones.get(claveSesion(c));
  if (s && s.venceEn - Date.now() > MARGEN_MS) return s.access;
  if (s) {
    const r = await refrescar(c, fetch, s);
    if (r) return r.access;
  }
  return (await signIn(c, fetch)).access;
}

/**
 * Llamada autenticada. Devuelve status + cuerpo ya parseado. Un 401 renueva la sesión y reintenta
 * una vez; el resto de los códigos los interpreta quien llama.
 */
export async function icpayLlamar(
  c: IcpayConfig, fetch: FetchLike, metodo: 'GET' | 'POST', ruta: string, cuerpo?: any, extra?: Record<string, string>,
): Promise<{ status: number; body: any }> {
  const una = async () => pedir(fetch, c.baseUrl + ruta, {
    method: metodo,
    headers: {
      'x-api-key': c.apiKey, Authorization: `Bearer ${await token(c, fetch)}`, Accept: 'application/json',
      ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(extra || {}),
    },
    ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
  });
  const r = await una();
  if (r.status !== 401) return r;
  sesiones.delete(claveSesion(c));
  return una();
}
