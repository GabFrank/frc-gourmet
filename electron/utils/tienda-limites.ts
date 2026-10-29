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
/** F5 (M-auth3): por día, para que una sola IP no agote el tope global diario. */
export const OTP_POR_IP_DIA = 10;
/** F5 (A-auth2): fallos de una cuenta desde cualquier IP en una hora antes de frenarla 15 min. */
export const LOGIN_FALLOS_CUENTA_HORA = 30;

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
  /** Saca la última marca (un intento reservado que terminó bien). */
  restarUltima(key: string): void {
    const v = this.marcas.get(key);
    if (!v?.length) return;
    v.pop();
    if (!v.length) this.marcas.delete(key);
  }
}

/**
 * F5 (auditoría M-auth2): clave de IP para los topes. Una IPv6 se agrupa por su /64 (un
 * cliente doméstico recibe un /64 entero y podía rotar direcciones para saltear el tope).
 */
export function claveIp(ip: string): string {
  const raw = String(ip || '').trim().replace(/^::ffff:/i, '');
  if (!raw.includes(':')) return raw || '-';
  let [cabeza, cola] = raw.split('::');
  const a = cabeza ? cabeza.split(':') : [];
  const b = cola != null ? (cola ? cola.split(':') : []) : [];
  const relleno = cola != null ? Array(Math.max(0, 8 - a.length - b.length)).fill('0') : [];
  const grupos = [...a, ...relleno, ...b].slice(0, 4).map((g) => (g || '0').toLowerCase().replace(/^0+(?=.)/, ''));
  return grupos.join(':') + '::/64';
}

const fallosIp = new Ventana(60 * MIN);
const otpIp = new Ventana(60 * MIN);
const otpIpDia = new Ventana(24 * 60 * MIN);
const registrosIp = new Ventana(60 * MIN);
/** F5 (M-auth6): altas de cuenta por email por IP por hora. */
export const REGISTROS_POR_IP_HORA = 10;
const fallosCuenta = new Ventana(60 * MIN);
const fallosCuentaIp = new Map<string, { fallos: number; bloqueadoHasta: number }>();

const claveCuentaIp = (cuentaId: number, ip: string) => `${cuentaId}|${claveIp(ip)}`;

/** null si puede intentar; si no, el motivo. Se consulta antes de verificar la contraseña. */
export function loginBloqueado(cuentaId: number | null, ip: string, ahora = Date.now()): 'ip_bloqueada' | 'cuenta_bloqueada' | null {
  if (fallosIp.contar(claveIp(ip), ahora) >= LOGIN_FALLOS_IP_HORA) return 'ip_bloqueada';
  if (cuentaId != null) {
    if (fallosCuenta.contar(String(cuentaId), ahora) >= LOGIN_FALLOS_CUENTA_HORA) return 'cuenta_bloqueada';
    const e = fallosCuentaIp.get(claveCuentaIp(cuentaId, ip));
    if (e && e.bloqueadoHasta > ahora) return 'cuenta_bloqueada';
  }
  return null;
}

export function registrarLoginFallido(cuentaId: number | null, ip: string, ahora = Date.now()): void {
  fallosIp.sumar(claveIp(ip), ahora);
  if (cuentaId == null) return;
  fallosCuenta.sumar(String(cuentaId), ahora);
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

/**
 * F5 (auditoría A-auth2): el intento se cuenta ANTES de verificar la contraseña (la
 * verificación es asíncrona y varios intentos en paralelo pasaban todos el chequeo). Devuelve
 * false si ya está bloqueado. Si la contraseña es correcta, `confirmarLoginOk` deshace la marca.
 */
export function reservarIntentoLogin(cuentaId: number | null, ip: string, ahora = Date.now()): boolean {
  if (loginBloqueado(cuentaId, ip, ahora)) return false;
  registrarLoginFallido(cuentaId, ip, ahora);
  return true;
}

export function confirmarLoginOk(cuentaId: number, ip: string): void {
  fallosIp.restarUltima(claveIp(ip));
  fallosCuenta.restarUltima(String(cuentaId));
  registrarLoginOk(cuentaId, ip);
}

/** true si la IP todavía puede pedir un código; si puede, lo cuenta. */
export function otpIpPermitido(ip: string, ahora = Date.now()): boolean {
  const k = claveIp(ip);
  if (otpIp.contar(k, ahora) >= OTP_POR_IP_HORA) return false;
  if (otpIpDia.contar(k, ahora) >= OTP_POR_IP_DIA) return false;
  otpIp.sumar(k, ahora);
  otpIpDia.sumar(k, ahora);
  return true;
}

/** true si la IP todavía puede crear una cuenta; si puede, la cuenta. */
export function registroIpPermitido(ip: string, ahora = Date.now()): boolean {
  const k = claveIp(ip);
  if (registrosIp.contar(k, ahora) >= REGISTROS_POR_IP_HORA) return false;
  registrosIp.sumar(k, ahora);
  return true;
}

/** Solo para tests. */
export function reiniciarLimitesTienda(): void {
  fallosIp.limpiar(); otpIp.limpiar(); otpIpDia.limpiar(); registrosIp.limpiar(); fallosCuenta.limpiar(); fallosCuentaIp.clear();
}
