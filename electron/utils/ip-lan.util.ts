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

/** ¿`ip` (IPv4 ya normalizado) cae dentro de `cidr` (`a.b.c.d` o `a.b.c.d/n`)? */
function matchCidr(ip: string, cidr: string): boolean {
  const c = cidr.trim();
  if (!c) return false;
  const [rangeRaw, bitsRaw] = c.split('/');
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt((rangeRaw || '').trim());
  // No es IPv4: comparar como igualdad literal (ej. un IPv6 exacto configurado).
  if (ipInt == null || rangeInt == null) return ip === c;
  const bits = bitsRaw == null ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  if (bits === 0) return true;
  const mask = bits === 32 ? 0xffffffff : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

/** Rangos privados por defecto (si el server es LAN-directo, sin proxy). */
const RANGOS_PRIVADOS = ['10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '127.0.0.0/8', '::1'];

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
