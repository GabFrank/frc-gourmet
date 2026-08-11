/**
 * Tokens efímeros para abrir streams SSE.
 *
 * EL PROBLEMA: `EventSource` del navegador no permite mandar headers, así que
 * el token no puede ir en `Authorization`. La solución obvia —mandar el JWT de
 * sesión por query string— lo deja escrito en los logs de acceso del servidor,
 * en el historial del navegador y en cualquier proxy intermedio. Un token de
 * sesión tiene horas de vida y sirve para TODO el `/api/rpc`: filtrarlo así es
 * regalar la sesión completa.
 *
 * LA SOLUCIÓN: un token aparte, con tres límites que el de sesión no tiene:
 *
 *   1. **Vive 60 segundos** — solo para abrir la conexión. Una vez abierta, el
 *      stream sigue vivo indefinidamente aunque el token venza.
 *   2. **Es de un solo uso** — se consume al abrir. Reusarlo desde un log no
 *      sirve.
 *   3. **Tiene alcance acotado** (`kds` o `musica`) — no abre el RPC.
 *
 * Firmado con HMAC-SHA256 sobre el mismo secreto que el resto de la app
 * (keytar). No se usa la librería JWT porque este token no viaja a terceros ni
 * necesita interoperar: un HMAC propio es menos superficie.
 */
import * as crypto from 'crypto';
import { getJwtSecret } from './jwt-secret.utils';

export type StreamScope = 'kds' | 'musica';

/** Ventana para abrir la conexión. Corta a propósito. */
const TTL_MS = 60_000;
/**
 * Los nonce consumidos se recuerdan un rato más que el TTL para que un token
 * no pueda reusarse dentro de su propia ventana de validez.
 */
const MEMORIA_NONCE_MS = 5 * 60_000;

interface PayloadStream {
  sub: number;
  scope: StreamScope;
  exp: number;
  nonce: string;
}

/** nonce → cuándo expira su recuerdo. */
const nonceUsados = new Map<string, number>();

function limpiarNonces(): void {
  const ahora = Date.now();
  for (const [nonce, hasta] of nonceUsados) {
    if (hasta < ahora) nonceUsados.delete(nonce);
  }
}

function b64url(buf: Buffer | string): string {
  const bytes = typeof buf === 'string' ? Buffer.from(buf, 'utf8') : buf;
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function firmar(payloadB64: string, secreto: string): string {
  return b64url(crypto.createHmac('sha256', secreto).update(payloadB64).digest());
}

/** Emite un token para abrir un stream. Lo pide el cliente por RPC autenticado. */
export async function emitirStreamToken(
  usuarioId: number,
  scope: StreamScope,
): Promise<{ token: string; expiraEn: number }> {
  const secreto = await getJwtSecret();
  const payload: PayloadStream = {
    sub: usuarioId,
    scope,
    exp: Date.now() + TTL_MS,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return {
    token: `${payloadB64}.${firmar(payloadB64, secreto)}`,
    expiraEn: payload.exp,
  };
}

export interface VerificacionStream {
  ok: boolean;
  usuarioId?: number;
  motivo?: string;
}

/**
 * Verifica y CONSUME el token. Devuelve `ok: false` con el motivo, que el
 * llamador debe traducir a 401 sin detalle hacia afuera.
 */
export async function consumirStreamToken(
  token: string,
  scopeEsperado: StreamScope,
): Promise<VerificacionStream> {
  if (!token) return { ok: false, motivo: 'sin token' };

  const partes = token.split('.');
  if (partes.length !== 2) return { ok: false, motivo: 'formato inválido' };
  const [payloadB64, firma] = partes;

  const secreto = await getJwtSecret();
  const esperada = firmar(payloadB64, secreto);
  // Comparación en tiempo constante: evita distinguir firmas por timing.
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, motivo: 'firma inválida' };
  }

  let payload: PayloadStream;
  try {
    payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
  } catch {
    return { ok: false, motivo: 'payload ilegible' };
  }

  if (payload.scope !== scopeEsperado) return { ok: false, motivo: 'alcance incorrecto' };
  if (!payload.exp || payload.exp < Date.now()) return { ok: false, motivo: 'expirado' };

  limpiarNonces();
  if (nonceUsados.has(payload.nonce)) return { ok: false, motivo: 'token ya usado' };
  nonceUsados.set(payload.nonce, Date.now() + MEMORIA_NONCE_MS);

  return { ok: true, usuarioId: payload.sub };
}
