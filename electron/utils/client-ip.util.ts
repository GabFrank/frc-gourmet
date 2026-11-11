/**
 * IP real del cliente para la superficie pública (/pub) — PLAN-tienda-online C2/C3.
 *
 * El server de Don Franco se publica con `cloudflared`: las peticiones de internet
 * llegan desde 127.0.0.1 y Cloudflare pone la IP real en `cf-connecting-ip`
 * (reemplaza lo que mande el cliente). Reglas:
 *  - socket no loopback → la IP del socket; se ignoran todas las cabeceras.
 *  - socket loopback con `cf-connecting-ip` → ese valor (viaTunel = true).
 *  - socket loopback con `cf-ray` y sin IP → loopback, pero viaTunel = true.
 *  - socket loopback sin cabeceras de Cloudflare → acceso local.
 * `X-Forwarded-For` no se usa nunca (lo puede forjar el cliente).
 */
import { normalizeIp } from './ip-lan.util';

export interface ClientIpInfo {
  ip: string;
  viaTunel: boolean;
}

function esLoopback(ip: string): boolean {
  return ip === '::1' || /^127\./.test(ip);
}

function header(req: any, nombre: string): string {
  const v = req?.headers?.[nombre];
  return String(Array.isArray(v) ? v[0] : v || '').trim();
}

export function clientIpDe(req: any): ClientIpInfo {
  const socket = normalizeIp(String(req?.raw?.socket?.remoteAddress || req?.socket?.remoteAddress || ''));
  if (!esLoopback(socket)) return { ip: socket, viaTunel: false };
  const cfIp = normalizeIp(header(req, 'cf-connecting-ip'));
  if (cfIp) return { ip: cfIp, viaTunel: true };
  if (header(req, 'cf-ray')) return { ip: socket, viaTunel: true };
  return { ip: socket, viaTunel: false };
}
