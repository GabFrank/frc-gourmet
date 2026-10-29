/**
 * Seguridad de la tienda online (PLAN-tienda-online F1): IP real detrás del
 * túnel (C2/C3) con cabeceras forjadas. Node puro, sin base.
 */
import { clientIpDe } from '../electron/utils/client-ip.util';
import { ipPermitidaMesa } from '../electron/utils/ip-lan.util';
import { loginBloqueado, registrarLoginFallido, registrarLoginOk, otpIpPermitido, reiniciarLimitesTienda, LOGIN_BLOQUEO_MS } from '../electron/utils/tienda-limites';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra ?? ''); }
}
const req = (socket: string, headers: Record<string, string> = {}) => ({ raw: { socket: { remoteAddress: socket } }, headers });

// La misma función que usa crear-pedido-online para MESA_QR.
function esLanMesa(r: any, rango: string | null): boolean {
  const { ip, viaTunel } = clientIpDe(r);
  return ipPermitidaMesa(ip, viaTunel, rango);
}

console.log('clientIpDe');
ok(clientIpDe(req('192.168.0.20')).ip === '192.168.0.20', 'LAN directa: IP del socket');
ok(clientIpDe(req('::ffff:192.168.0.20')).ip === '192.168.0.20', 'IPv4 mapeada se normaliza');
ok(clientIpDe(req('200.1.2.3', { 'x-forwarded-for': '192.168.0.10' })).ip === '200.1.2.3', 'XFF forjado desde afuera se ignora');
ok(clientIpDe(req('200.1.2.3', { 'cf-connecting-ip': '192.168.0.10' })).viaTunel === false, 'cf-connecting-ip desde socket no loopback se ignora');
const t = clientIpDe(req('127.0.0.1', { 'cf-connecting-ip': '181.120.5.6', 'x-forwarded-for': '192.168.0.10' }));
ok(t.ip === '181.120.5.6' && t.viaTunel, 'túnel: usa cf-connecting-ip, no XFF', t);
ok(clientIpDe(req('127.0.0.1', { 'cf-ray': 'abc' })).viaTunel === true, 'túnel con cf-ray sin IP → viaTunel');
ok(clientIpDe(req('127.0.0.1')).viaTunel === false, 'loopback sin cabeceras → local');

console.log('MESA_QR (requiereLanMesa)');
ok(esLanMesa(req('192.168.0.20'), null) === true, 'wifi del local directo → permitido');
ok(esLanMesa(req('127.0.0.1', { 'cf-connecting-ip': '181.120.5.6' }), null) === false, 'internet por túnel sin rango → rechazado (antes pasaba como 127.0.0.1)');
ok(esLanMesa(req('127.0.0.1', { 'cf-ray': 'x' }), null) === false, 'túnel sin IP → rechazado');
ok(esLanMesa(req('127.0.0.1', { 'cf-connecting-ip': '192.168.0.10' }), null) === false, 'túnel con IP privada forjada → rechazado');
ok(esLanMesa(req('127.0.0.1', { 'cf-connecting-ip': '192.168.0.10' }), '192.168.0.0/16') === false, 'túnel con IP privada aunque esté en el rango → rechazado');
ok(esLanMesa(req('127.0.0.1', { 'cf-connecting-ip': '181.120.5.6' }), '181.120.5.6') === true, 'túnel desde la IP pública del local cargada en el rango → permitido');
ok(esLanMesa(req('127.0.0.1', { 'cf-connecting-ip': '181.120.9.9' }), '181.120.5.6') === false, 'túnel desde otra IP pública → rechazado');

console.log('Anti fuerza bruta y topes OTP');
reiniciarLimitesTienda();
const t0 = 1_000_000;
for (let i = 0; i < 4; i++) registrarLoginFallido(7, '1.1.1.1', t0);
ok(loginBloqueado(7, '1.1.1.1', t0) === null, '4 fallos: todavía puede intentar');
registrarLoginFallido(7, '1.1.1.1', t0);
ok(loginBloqueado(7, '1.1.1.1', t0) === 'cuenta_bloqueada', '5 fallos cuenta+IP → bloqueada');
ok(loginBloqueado(7, '2.2.2.2', t0) === null, 'el dueño desde otra IP no queda bloqueado');
ok(loginBloqueado(7, '1.1.1.1', t0 + LOGIN_BLOQUEO_MS + 1) === null, 'a los 15 min se libera');
registrarLoginOk(7, '2.2.2.2');
reiniciarLimitesTienda();
for (let i = 0; i < 20; i++) registrarLoginFallido(100 + i, '3.3.3.3', t0);
ok(loginBloqueado(999, '3.3.3.3', t0) === 'ip_bloqueada', '20 fallos de una IP en cualquier cuenta → IP frenada');
ok(loginBloqueado(999, '3.3.3.3', t0 + 61 * 60_000) === null, 'la ventana por IP es de una hora');
reiniciarLimitesTienda();
let otps = 0;
for (let i = 0; i < 35; i++) if (otpIpPermitido('4.4.4.4', t0)) otps++;
ok(otps === 30, 'OTP: 30 por IP por hora', otps);
ok(otpIpPermitido('5.5.5.5', t0), 'OTP: otra IP sigue pudiendo');
reiniciarLimitesTienda();

console.log(`\n[tienda-seguridad] RESULTADO: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
