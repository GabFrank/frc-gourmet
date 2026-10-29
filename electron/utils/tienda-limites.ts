/**
 * Topes en memoria de la tienda online (PLAN-tienda-online F1, A1.3 y topes de OTP).
 *
 * Viven en el proceso del server: un reinicio los limpia, lo que solo acorta un bloqueo
 * en curso. Un proceso único atiende /pub, así que no hace falta compartirlos.
 * - Login por contraseña: 5 fallos seguidos de la misma cuenta DESDE la misma IP la
 *   bloquean 15 min solo para esa IP (un tercero no puede bloquearle la cuenta al dueño),
 *   y una IP con 20 fallos en una hora queda frenada para cualquier cuenta.
 * - Códigos OTP: 30 pedidos por IP por hora.
 */

const MIN = 60_000;
export const LOGIN_FALLOS_CUENTA_IP = 5;
export const LOGIN_BLOQUEO_MS = 15 * MIN;
export const LOGIN_FALLOS_IP_HORA = 20;
export const OTP_POR_IP_HORA = 30;

/** Marcas de tiempo por clave, con ventana deslizante. */
class Ventana {
  private marcas = new Map<string, number[]>();
  constructor(private readonly ms: number) {}
  private vigentes(key: string, ahora: number): number[] {
    const v = (this.marcas.get(key) || []).filter((t) => ahora - t < this.ms);
    if (v.length) this.marcas.set(key, v); else this.marcas.delete(key);
    return v;
  }
  contar(key: string, ahora = Date.now()): number { return this.vigentes(key, ahora).length; }
  sumar(key: string, ahora = Date.now()): void { this.marcas.set(key, [...this.vigentes(key, ahora), ahora]); }
  limpiar(key?: string): void { if (key == null) this.marcas.clear(); else this.marcas.delete(key); }
}

const fallosIp = new Ventana(60 * MIN);
const otpIp = new Ventana(60 * MIN);
const fallosCuentaIp = new Map<string, { fallos: number; bloqueadoHasta: number }>();

const claveCuentaIp = (cuentaId: number, ip: string) => `${cuentaId}|${ip || '-'}`;

/** null si puede intentar; si no, el motivo. Se consulta antes de verificar la contraseña. */
export function loginBloqueado(cuentaId: number | null, ip: string, ahora = Date.now()): 'ip_bloqueada' | 'cuenta_bloqueada' | null {
  if (fallosIp.contar(ip || '-', ahora) >= LOGIN_FALLOS_IP_HORA) return 'ip_bloqueada';
  if (cuentaId != null) {
    const e = fallosCuentaIp.get(claveCuentaIp(cuentaId, ip));
    if (e && e.bloqueadoHasta > ahora) return 'cuenta_bloqueada';
  }
  return null;
}

export function registrarLoginFallido(cuentaId: number | null, ip: string, ahora = Date.now()): void {
  fallosIp.sumar(ip || '-', ahora);
  if (cuentaId == null) return;
  const k = claveCuentaIp(cuentaId, ip);
  const e = fallosCuentaIp.get(k) || { fallos: 0, bloqueadoHasta: 0 };
  if (e.bloqueadoHasta && e.bloqueadoHasta <= ahora) { e.fallos = 0; e.bloqueadoHasta = 0; }
  e.fallos++;
  if (e.fallos >= LOGIN_FALLOS_CUENTA_IP) { e.bloqueadoHasta = ahora + LOGIN_BLOQUEO_MS; e.fallos = 0; }
  fallosCuentaIp.set(k, e);
}

export function registrarLoginOk(cuentaId: number, ip: string): void {
  fallosCuentaIp.delete(claveCuentaIp(cuentaId, ip));
}

/** true si la IP todavía puede pedir un código; si puede, lo cuenta. */
export function otpIpPermitido(ip: string, ahora = Date.now()): boolean {
  const k = ip || '-';
  if (otpIp.contar(k, ahora) >= OTP_POR_IP_HORA) return false;
  otpIp.sumar(k, ahora);
  return true;
}

/** Solo para tests. */
export function reiniciarLimitesTienda(): void {
  fallosIp.limpiar(); otpIp.limpiar(); fallosCuentaIp.clear();
}
