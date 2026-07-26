/**
 * Validación de IP de origen para el canal MESA_QR (anti-fraude "solo desde la
 * red del local"). Como el server suele estar detrás de un reverse proxy en la
 * nube, el IP real del cliente llega por `X-Forwarded-For` (requiere `trustProxy`
 * en Fastify) y, para clientes en la WiFi del local, es la **IP pública de egreso
 * del local** — por eso `rangoLanMesa` normalmente contiene esa IP pública, no
 * un rango privado. Si el server es accesible directo en la LAN, se usan rangos
 * privados.
 */

/** Normaliza IPv4-mapped IPv6 (`::ffff:192.168.1.5` → `192.168.1.5`). */
export function normalizeIp(ip: string): string {
  if (!ip) return '';
  const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip.trim());
  return m ? m[1] : ip.trim();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    const b = Number(p);
    if (!Number.isInteger(b) || b < 0 || b > 255) return null;
    n = (n << 8) | b;
  }
  return n >>> 0;
}

/** Expande y parsea un IPv6 a BigInt de 128 bits. null si no es IPv6 válido. */
function ipv6ToBigInt(ip: string): bigint | null {
  let str = ip.trim();
  if (!str.includes(':')) return null;
  const pct = str.indexOf('%'); // zona (%eth0)
  if (pct >= 0) str = str.slice(0, pct);
  // IPv4 embebido al final (ej. 64:ff9b::1.2.3.4)
  const v4 = str.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const v4int = ipv4ToInt(v4[2]);
    if (v4int == null) return null;
    str = `${v4[1]}${((v4int >>> 16) & 0xffff).toString(16)}:${(v4int & 0xffff).toString(16)}`;
  }
  const dbl = str.split('::');
  if (dbl.length > 2) return null;
  const head = dbl[0] ? dbl[0].split(':') : [];
  const tail = dbl.length === 2 && dbl[1] ? dbl[1].split(':') : [];
  const missing = 8 - (head.length + tail.length);
  if (dbl.length === 1 && head.length !== 8) return null;
  if (dbl.length === 2 && missing < 1) return null;
  const groups = dbl.length === 2 ? [...head, ...Array(missing).fill('0'), ...tail] : head;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

/** Match CIDR IPv6 (o IP exacta si no hay /prefijo). */
function matchCidr6(ip: string, cidr: string): boolean {
  const [rangeRaw, bitsRaw] = cidr.split('/');
  const ipN = ipv6ToBigInt(ip);
  const rangeN = ipv6ToBigInt((rangeRaw || '').trim());
  if (ipN == null || rangeN == null) return false;
  const bits = bitsRaw == null ? 128 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 128) return false;
  if (bits === 0) return true;
  const shift = BigInt(128 - bits);
  return (ipN >> shift) === (rangeN >> shift);
}

/** ¿`ip` cae dentro de `cidr`? Soporta IPv4 (`a.b.c.d/n`) e IPv6 (`::/n`). */
function matchCidr(ip: string, cidr: string): boolean {
  const c = cidr.trim();
  if (!c) return false;
  // IPv6 si cualquiera de los dos lo es (evita mezclar familias).
  if (ip.includes(':') || c.includes(':')) return matchCidr6(ip, c);
  const [rangeRaw, bitsRaw] = c.split('/');
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt((rangeRaw || '').trim());
  if (ipInt == null || rangeInt == null) return false;
  const bits = bitsRaw == null ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Rangos privados por defecto (si el server es LAN-directo, sin proxy). */
const RANGOS_PRIVADOS = [
  '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', // IPv4
  '::1/128', 'fc00::/7', 'fe80::/10', // IPv6 loopback / ULA / link-local
];

/**
 * ¿El IP está dentro de los rangos permitidos para MESA_QR? `rangosCsv` son
 * CIDRs o IPs separados por coma (ej. la IP pública del local). Vacío → rangos
 * privados por defecto.
 */
export function ipEnRangosLan(rawIp: string, rangosCsv?: string | null): boolean {
  const ip = normalizeIp(String(rawIp || ''));
  if (!ip) return false;
  const rangos = rangosCsv && rangosCsv.trim()
    ? rangosCsv.split(',').map((s) => s.trim()).filter(Boolean)
    : RANGOS_PRIVADOS;
  return rangos.some((r) => matchCidr(ip, r));
}
