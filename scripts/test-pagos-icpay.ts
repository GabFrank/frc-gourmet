/**
 * Pago online con IC Pay (Pix) y varios proveedores a la vez (PLAN-tienda-pagos-multi-icpay)
 * contra un IC SIMULADO que se comporta como la API real («IC Investments API»): x-api-key +
 * JWT de sign-in, refresh, cotización PYG→USD, orden en USD con Idempotency-Key, QR Pix. Sin red.
 *
 * Uso: npm run test:pagos-icpay   ·   TIENDA_PG=<base vacía> … (Postgres)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { PedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PagoOnlineEvento } from '../src/app/database/entities/pedidos-online/pago-online-evento.entity';
import { TiendaOnlineConfig } from '../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline, FORMAS_PAGO_ONLINE, esMetodoPagoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import {
  iniciarPagoPedido, verificarPagoPedido, setPagosOnlineDeps, pagoOnlineDisponible, cuentasListas, procesarAvisoPago,
  tickPagosOnline,
} from '../electron/services/pagos-online/pagos-online.service';
import { icpayProveedor, interpretarOrdenIcpay, montoIcpay, usdDesdeGuaranies } from '../electron/services/pagos-online/proveedores/icpay.proveedor';
import { normalizarApiKey, normalizarBaseIcpay, olvidarSesionesIcpay } from '../electron/services/pagos-online/proveedores/icpay-auth';
import { cargarCredencialesTienda, proveedoresPagoListos, pagoOnlineOfrecido } from '../electron/utils/tienda-ingreso.utils';
import { FormaPagoOnline } from '../src/app/database/entities/pedidos-online/forma-pago-online.entity';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const BASE = 'https://stage.api.ic.com.py';
const KEY = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const EMAIL = 'tienda@ejemplo.com';
const PASS = 'Clave-Segura-1';
const KEY2 = 'cccccccc-4444-5555-6666-dddddddddddd';
const EMAIL2 = 'sucursal2@ejemplo.com';
const PASS2 = 'Otra-Clave-2';
const PYG_POR_USD = 6350;
const BRL_POR_USD = 5.6359;

// ── IC simulado ──
interface Orden { id: string; amount: string; currency: string; totalAmount: string; status: string; expiresAt: string; idem: string; body: string }
const ordenes = new Map<string, Orden>();
const porIdem = new Map<string, Orden>();
const tokens = new Set<string>();
const refreshes = new Set<string>();
const llamadas: Array<{ metodo: string; ruta: string; headers: any; body: any }> = [];
let n = 0;
let desafio: string | null = null;
let cotizacionMala = false;
let expiresIn = 3600;
const fakeFetch = async (url: string, init: any = {}) => {
  const res = (status: number, b: any) => ({ status, text: async () => JSON.stringify(b) });
  const u = new URL(url);
  if (u.origin !== BASE) return res(404, { message: `Cannot ${init.method} ${u.pathname}` });
  const h = init.headers || {};
  const body = init.body ? JSON.parse(init.body) : null;
  llamadas.push({ metodo: init.method || 'GET', ruta: u.pathname + u.search, headers: h, body });
  const ruta = u.pathname;
  if (ruta === '/api/v1/auth/admin/sign-in') {
    if (!h['x-api-key']) return res(400, { message: 'API Key required' });
    const valido = (h['x-api-key'] === KEY && body?.email === EMAIL && body?.password === PASS)
      || (h['x-api-key'] === KEY2 && body?.email === EMAIL2 && body?.password === PASS2)
      || (body?.email === EMAIL && body?.password === PASS);
    if (!valido) return res(400, { message: 'Incorrect username or password.' });
    if (desafio) return res(201, { challengeName: desafio, session: 'sess', email: EMAIL });
    const t = `tok-${++n}`; const r = `ref-${n}`; tokens.add(t); refreshes.add(r);
    return res(201, { accessToken: t, idToken: 'id', refreshToken: r, expiresIn, tokenType: 'Bearer' });
  }
  if (ruta === '/api/v1/auth/admin/refresh-session') {
    if (!refreshes.has(body?.refreshToken)) return res(400, { message: 'Invalid refresh token' });
    const t = `tok-${++n}`; tokens.add(t);
    return res(201, { accessToken: t, idToken: 'id', expiresIn, tokenType: 'Bearer' });
  }
  if (h['x-api-key'] !== KEY && h['x-api-key'] !== KEY2) return res(401, { message: 'Invalid API Key', statusCode: 401 });
  const tok = String(h['Authorization'] || '').replace(/^Bearer /, '');
  if (!tokens.has(tok)) return res(401, { error: 'TokenExpired', message: 'Access token expired', statusCode: 401 });
  if (ruta === '/api/v1/quote') {
    if (cotizacionMala) return res(200, { success: true, data: { fromCurrency: 'PYG', toCurrency: 'USD', baseExchangeRate: '0', targetExchangeRate: '0' } });
    return res(200, { success: true, data: { fromCurrency: 'PYG', toCurrency: 'USD', baseExchangeRate: String(PYG_POR_USD), targetExchangeRate: String(1 / PYG_POR_USD) } });
  }
  if (ruta === '/api/v1/payment/order' && init.method === 'POST') {
    const idem = h['Idempotency-Key'];
    const prev = idem ? porIdem.get(idem) : null;
    if (prev) return prev.body === init.body ? res(201, vista(prev)) : res(422, { message: 'Idempotency-Key reused with a different body' });
    const amount = String(body?.amount);
    const o: Orden = {
      id: `ord-${++n}`, amount, currency: body.currency, totalAmount: (Math.round(Number(amount) * BRL_POR_USD * 100) / 100).toFixed(2),
      status: 'pending', expiresAt: new Date(Date.now() + 3600_000).toISOString(), idem, body: init.body,
    };
    ordenes.set(o.id, o);
    if (idem) porIdem.set(idem, o);
    return res(201, vista(o));
  }
  const m = ruta.match(/^\/api\/v1\/payment\/order\/(.+)$/);
  if (m) {
    const o = ordenes.get(decodeURIComponent(m[1]));
    return o ? res(200, vista(o)) : res(404, { message: 'Payment order not found' });
  }
  if (ruta === '/api/v1/store/me') return res(200, { id: 's1', name: h['x-api-key'] === KEY2 ? 'SUCURSAL 2' : 'FRANCO EMPRENDIMIENTOS', document: '80127721-3', type: 'juridico' });
  if (ruta === '/api/v1/account/me') return res(200, { data: { id: 'a1', currentBalance: '0.00', currency: 'USD' } });
  return res(404, {});
};
const vista = (o: Orden) => ({
  id: o.id, currency: o.currency, payerId: o.status === 'completed' ? '12345678900' : null, quote: String(BRL_POR_USD), totalAmount: o.totalAmount,
  amount: o.amount, pendingAmount: null, status: o.status, createdAt: new Date().toISOString(),
  qrData: { type: 'PIX_DYNAMIC', payload: `00020101021226860014br.gov.bcb.pix2564qr.example/${o.id}5204000053039865802BR6304ABCD`, expiresAt: o.expiresAt, fid: 'fid' },
  providerMetadata: o.status === 'completed' ? { payerName: 'JOAO DA SILVA', taxId: '12345678900' } : null,
});

const avisos: string[] = [];

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pagos-icpay.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[pagos-icpay] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  let apiKey = KEY;
  let password = PASS;
  setPagosOnlineDeps({
    fetch: fakeFetch as any, apiKey: async () => '', avisar: async (t) => { avisos.push(t); },
    secretos: { 'ICPAY.apiKey': async () => apiKey, 'ICPAY.password': async () => password, 'BANCARD.privateKey': async () => 'privKeyTest456' },
  });
  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  let cfg = await cfgRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) cfg = await cfgRepo.save(cfgRepo.create({ activa: true } as any) as any) as TiendaOnlineConfig;
  const conf = (extra: any = {}) => cfgRepo.update({ id: cfg!.id }, {
    pagoOnlineActivo: true, pagoProveedor: 'ICPAY', aceptacionAutomatica: false,
    pagoConfigJson: JSON.stringify({ ICPAY: { baseUrl: BASE + '/api/v1/', email: EMAIL }, BANCARD: { publicKey: 'pubKeyTest123', entorno: 'PRUEBA' } }), ...extra,
  } as any);
  const leerCfg = () => cfgRepo.findOne({ where: { id: cfg!.id } });

  console.log('Funciones puras');
  ok(usdDesdeGuaranies(6350, 6350) === 1 && usdDesdeGuaranies(112000, 6350) === 17.64 && usdDesdeGuaranies(6351, 6350) === 1.01,
    'guaraníes → USD redondeando hacia arriba a centavos', [usdDesdeGuaranies(112000, 6350), usdDesdeGuaranies(6351, 6350)]);
  ok(isNaN(usdDesdeGuaranies(1000, 0)) && isNaN(usdDesdeGuaranies(0, 6350)), 'sin tasa o sin monto → NaN');
  ok(montoIcpay('5.64') === 5.64 && montoIcpay('541,24') === 541.24 && montoIcpay('1.234,56') === 1234.56 && isNaN(montoIcpay('x')), 'montos de IC con punto o coma');
  ok(normalizarBaseIcpay('https://stage.api.ic.com.py/api/v1/') === BASE && normalizarBaseIcpay(BASE) === BASE, 'URL base sin el prefijo /api/v1');
  ok(normalizarApiKey(`x-api-key: ${KEY}`) === KEY && normalizarApiKey(`  ${KEY} `) === KEY, 'API key copiada con el nombre de la cabecera');
  const ahora = new Date();
  const orden = (o: any) => ({ id: 'o1', amount: '1.00', currency: 'BRL', totalAmount: '5.64', status: 'completed', qrData: { expiresAt: new Date(ahora.getTime() + 60_000).toISOString() }, ...o });
  const esp = { sesionId: 'o1', usd: 1, ahora };
  ok(interpretarOrdenIcpay(orden({}), esp).tipo === 'PAGADO', 'completed + mismo id, USD y BRL → PAGADO');
  ok(interpretarOrdenIcpay(orden({ amount: '0.99' }), esp).tipo === 'INCONSISTENTE', 'otro monto → INCONSISTENTE');
  ok(interpretarOrdenIcpay(orden({ currency: 'ARS' }), esp).tipo === 'INCONSISTENTE', 'otra moneda → INCONSISTENTE');
  ok(interpretarOrdenIcpay(orden({ id: 'o2' }), esp).tipo === 'INCONSISTENTE', 'otra orden → INCONSISTENTE');
  ok(interpretarOrdenIcpay(orden({}), { ...esp, usd: null }).tipo === 'INCONSISTENTE', 'sin el USD del intento → no se da por pagado');
  ok(interpretarOrdenIcpay(orden({ status: 'pending' }), esp).tipo === 'PENDIENTE', 'pending vigente → PENDIENTE');
  ok(interpretarOrdenIcpay(orden({ status: 'pending' }), { ...esp, ahora: new Date(ahora.getTime() + 20 * 60_000) }).tipo === 'EXPIRADO', 'pending 15 min después del vencimiento → EXPIRADO');
  ok(interpretarOrdenIcpay(orden({ status: 'expired' }), esp).tipo === 'EXPIRADO', 'expired → EXPIRADO');
  ok(interpretarOrdenIcpay(orden({ status: 'cancelled' }), esp).tipo === 'FALLIDO', 'cancelled → FALLIDO');
  for (const st of ['underpaid', 'duplicated', 'under_dispute', 'refunded']) ok(interpretarOrdenIcpay(orden({ status: st }), esp).tipo === 'INCONSISTENTE', `${st} → INCONSISTENTE`);
  ok(interpretarOrdenIcpay(orden({ status: 'raro' }), esp).tipo === 'PENDIENTE', 'estado desconocido → PENDIENTE');
  ok(esMetodoPagoOnline('ICPAY') && FORMAS_PAGO_ONLINE.includes('PIX ONLINE'), 'ICPAY es un método online con su forma de pago');
  const fp = await ds.query(`SELECT "activo" FROM "formas_pago" WHERE "nombre" = 'PIX ONLINE'`);
  ok(fp.length === 1 && !fp[0].activo, 'la migración siembra la forma de pago PIX ONLINE inactiva', fp);

  console.log('Configuración');
  await conf();
  ok(await pagoOnlineDisponible(ds), 'IC Pay con URL, usuario, API key y contraseña → se ofrece');
  password = '';
  ok(!(await pagoOnlineDisponible(ds)), 'sin contraseña → no se ofrece');
  password = PASS;
  const creds = (await icpayProveedor.credenciales(ds, await leerCfg()))!;
  ok(creds.baseUrl === BASE, 'la URL se guarda tal cual y se normaliza al usarla');
  const pc = await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  ok(pc.ok && /FRANCO EMPRENDIMIENTOS/.test(pc.detalle || '') && /USD/.test(pc.detalle || ''), 'probar conexión → comercio y moneda de la cuenta', pc);
  olvidarSesionesIcpay();
  apiKey = 'otra';
  const pcMal = await icpayProveedor.probarConexion((await icpayProveedor.credenciales(ds, await leerCfg()))!, { fetch: fakeFetch as any });
  ok(!pcMal.ok && pcMal.error === 'icpay_credenciales', 'API key mala → icpay_credenciales', pcMal);
  apiKey = `x-api-key: ${KEY}`;
  olvidarSesionesIcpay();
  ok((await icpayProveedor.probarConexion((await icpayProveedor.credenciales(ds, await leerCfg()))!, { fetch: fakeFetch as any })).ok, 'API key pegada con «x-api-key:» → igual conecta');
  apiKey = KEY;
  olvidarSesionesIcpay();
  desafio = 'SOFTWARE_TOKEN_MFA';
  const pcMfa = await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  ok(!pcMfa.ok && pcMfa.error === 'icpay_mfa', 'usuario con MFA → icpay_mfa', pcMfa);
  desafio = null;

  console.log('Sesión con IC');
  olvidarSesionesIcpay();
  const signIns = () => llamadas.filter((l) => l.ruta.endsWith('/sign-in')).length;
  const s0 = signIns();
  await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  ok(signIns() === s0 + 1, 'el token se reusa entre llamadas (un solo sign-in)');
  tokens.clear();
  const pc401 = await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  ok(pc401.ok && signIns() === s0 + 2, 'token vencido del lado de IC (401) → sign-in nuevo y reintento', pc401);
  olvidarSesionesIcpay();
  expiresIn = 60; // vence en 1 min: dentro del margen → la próxima llamada renueva
  await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  const r0 = llamadas.filter((l) => l.ruta.endsWith('/refresh-session')).length;
  const s1 = signIns();
  await icpayProveedor.probarConexion(creds, { fetch: fakeFetch as any });
  ok(llamadas.filter((l) => l.ruta.endsWith('/refresh-session')).length > r0 && signIns() === s1, 'token por vencer → refresh (sin volver a mandar la contraseña)');
  expiresIn = 3600;
  ok(!llamadas.some((l) => l.ruta.includes('/payment/order') && JSON.stringify(l.body || {}).includes(PASS)), 'la contraseña solo viaja al sign-in');

  const repo = ds.getRepository(PedidoOnline);
  let seq = 0;
  const nuevo = async (total = 112000, metodo = 'ICPAY') => repo.save(repo.create({
    numero: `PI-${String(++seq).padStart(5, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado: EstadoPedidoOnline.PENDIENTE_PAGO, pagoModalidad: 'ONLINE',
    metodoPago: metodo, subtotal: total, costoEnvio: 0, total, items: [],
  } as any) as any) as Promise<PedidoOnline>;
  const leer = (id: number) => repo.findOne({ where: { id } }) as Promise<PedidoOnline>;
  const datosDe = async (id: number) => JSON.parse((await repo.createQueryBuilder('p').addSelect('p.pagoDatosJson').where('p.id = :id', { id }).getOne())?.pagoDatosJson || 'null');
  const eventos = async (id: number) => (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: id } }));

  console.log('Cobro con QR Pix');
  const p1 = await nuevo(112000);
  const i1: any = await iniciarPagoPedido(ds, p1.id);
  const crear = llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/api/v1/payment/order');
  const c1 = crear[crear.length - 1];
  ok(i1.success && i1.tipo === 'QR' && i1.qr?.payload?.startsWith('000201') && i1.qr.moneda === 'BRL', 'devuelve el QR Pix (copia e cola) para la página de pago', i1);
  ok(c1.body.amount === '17.64' && c1.body.currency === 'BRL' && !!c1.headers['Idempotency-Key'], 'orden en USD (₲112.000 / 6350 = 17.64), en BRL y con Idempotency-Key', c1);
  ok(i1.qr.monto === (Math.round(17.64 * BRL_POR_USD * 100) / 100).toFixed(2), 'muestra lo que paga el cliente en reales', i1.qr);
  let q = await leer(p1.id);
  const d1 = await datosDe(p1.id);
  ok(q.pagoProveedor === 'ICPAY' && q.pagoSesionId === ordenes.get(q.pagoSesionId!)?.id && q.estadoPago === EstadoPagoOnline.PENDIENTE, 'el pedido guarda la orden de IC y queda pendiente', q);
  ok(d1?.usd === '17.64' && d1?.qr?.payload === i1.qr.payload && d1?.pygPorUsd === PYG_POR_USD, 'guarda el USD del intento, la tasa y el QR', d1);
  ok(Math.abs(new Date(q.pagoExpiraEn!).getTime() - new Date(ordenes.get(q.pagoSesionId!)!.expiresAt).getTime()) < 1000, 'vence cuando vence el QR');
  const antes = crear.length;
  const i1b: any = await iniciarPagoPedido(ds, p1.id);
  ok(i1b.tipo === 'QR' && i1b.qr.payload === i1.qr.payload && llamadas.filter((l) => l.metodo === 'POST' && l.ruta === '/api/v1/payment/order').length === antes,
    'volver a la página: el mismo QR, sin crear otra orden');
  let v = await verificarPagoPedido(ds, p1.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && !v.error, 'consulta antes de pagar → pendiente', v);
  ordenes.get(q.pagoSesionId!)!.status = 'completed';
  v = await verificarPagoPedido(ds, p1.id);
  q = await leer(p1.id);
  ok(v.recienPagado && q.estadoPago === EstadoPagoOnline.PAGADO && q.estado === EstadoPedidoOnline.RECIBIDO, 'Pix cobrado → PAGADO y el pedido entra (RECIBIDO)', v);
  ok(q.pagoId === q.pagoSesionId && Number(q.pagoMonto) === 112000, 'pago = orden de IC; el monto guardado es en guaraníes', q);
  const crudos = (await eventos(p1.id)).map((e) => e.respuesta || '').join(' ');
  ok(crudos.includes('JOAO DA SILVA') && !crudos.includes('12345678900'), 'el historial guarda el nombre del pagador, no su CPF');
  ok(!/tok-\d|ref-\d/.test(crudos) && !crudos.includes(PASS) && !crudos.includes(KEY), 'el historial no guarda tokens, contraseña ni API key');

  console.log('Idempotencia');
  const p2 = await nuevo(6350);
  await repo.update({ id: p2.id }, { pagoIdemKey: 'clave-fija-1' } as any);
  const before = ordenes.size;
  await iniciarPagoPedido(ds, p2.id);
  const s2 = (await leer(p2.id)).pagoSesionId;
  // Reintento de red: se borró la sesión guardada pero la clave es la misma → misma orden.
  await repo.update({ id: p2.id }, { pagoSesionId: null, pagoCheckoutUrl: null } as any);
  await iniciarPagoPedido(ds, p2.id);
  ok(ordenes.size === before + 1 && (await leer(p2.id)).pagoSesionId === s2, 'misma Idempotency-Key → IC devuelve la misma orden, no cobra dos veces');

  console.log('Errores al crear');
  cotizacionMala = true;
  const p3 = await nuevo(50000);
  const i3: any = await iniciarPagoPedido(ds, p3.id);
  ok(!i3.success && i3.error === 'icpay_cotizacion', 'cotización inválida → no se crea la orden', i3);
  cotizacionMala = false;

  console.log('Vencido, cancelado y otros estados');
  const p4 = await nuevo(20000);
  await iniciarPagoPedido(ds, p4.id);
  ordenes.get((await leer(p4.id)).pagoSesionId!)!.status = 'expired';
  v = await verificarPagoPedido(ds, p4.id);
  q = await leer(p4.id);
  ok(q.estadoPago === EstadoPagoOnline.EXPIRADO && q.estado === EstadoPedidoOnline.CANCELADO, 'QR vencido → EXPIRADO y el pedido se cancela', q);
  const p5 = await nuevo(20000);
  await iniciarPagoPedido(ds, p5.id);
  ordenes.get((await leer(p5.id)).pagoSesionId!)!.status = 'underpaid';
  avisos.length = 0;
  v = await verificarPagoPedido(ds, p5.id);
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.PENDIENTE && avisos.some((a) => /IC Pay/.test(a) && /incompleto/.test(a)), 'pago incompleto → no se da por pagado y avisa al personal', avisos);
  ordenes.get((await leer(p5.id)).pagoSesionId!)!.amount = '9.99';
  ordenes.get((await leer(p5.id)).pagoSesionId!)!.status = 'completed';
  avisos.length = 0;
  await verificarPagoPedido(ds, p5.id);
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.PENDIENTE && avisos.some((a) => /no coincide/.test(a)), 'cobrado por otro monto → INCONSISTENTE con aviso', avisos);

  console.log('Pago tardío');
  const p6 = await nuevo(30000);
  await iniciarPagoPedido(ds, p6.id);
  await repo.update({ id: p6.id }, { estado: EstadoPedidoOnline.CANCELADO } as any);
  ordenes.get((await leer(p6.id)).pagoSesionId!)!.status = 'completed';
  avisos.length = 0;
  await verificarPagoPedido(ds, p6.id);
  ok((await leer(p6.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE && avisos.some((a) => /IC Pay/.test(a)), 'paga después de cancelado → queda para devolver (en IC Pay)', avisos);
  ok(!icpayProveedor.devolver, 'IC Pay no declara devolución automática');

  console.log('Job');
  const p7 = await nuevo(9000);
  await iniciarPagoPedido(ds, p7.id);
  ordenes.get((await leer(p7.id)).pagoSesionId!)!.status = 'completed';
  const t = await tickPagosOnline(ds, { ahora: new Date(Date.now() + 2 * 60_000) });
  ok(t.pagados >= 1 && (await leer(p7.id)).estadoPago === EstadoPagoOnline.PAGADO, 'sin webhook, el job confirma el Pix', t);

  console.log('Cuentas de pago (formas_pago_online)');
  const formaRepo = ds.getRepository(FormaPagoOnline);
  const crearForma = (o: any) => formaRepo.save(formaRepo.create({ activo: true, permitePickup: true, permiteDelivery: true, ...o }) as any) as Promise<FormaPagoOnline>;
  const fBan = await crearForma({ proveedor: 'BANCARD', nombre: 'TARJETA — BANCARD', orden: 1, configJson: JSON.stringify({ publicKey: 'pubKeyTest123', entorno: 'PRUEBA' }) });
  const fIc1 = await crearForma({ proveedor: 'ICPAY', nombre: 'PIX (BRASIL)', orden: 2, configJson: JSON.stringify({ baseUrl: BASE, email: EMAIL }) });
  const fIc2 = await crearForma({ proveedor: 'ICPAY', nombre: 'PIX SUCURSAL 2', orden: 3, permitePickup: false, configJson: JSON.stringify({ baseUrl: BASE, email: EMAIL2 }) });
  const secretos: Record<string, () => Promise<string>> = {
    [`BANCARD#${fBan.id}.privateKey`]: async () => 'privKeyTest456',
    [`ICPAY#${fIc1.id}.apiKey`]: async () => KEY, [`ICPAY#${fIc1.id}.password`]: async () => PASS,
  };
  setPagosOnlineDeps({ secretos });
  let c = await leerCfg();
  const ids = (l: any[]) => l.map((x) => x.forma?.id ?? x.formaId).join();
  ok(ids(await cuentasListas(ds, c)) === `${fBan.id},${fIc1.id}`, 'con cuentas cargadas mandan ellas, en su orden; la 2.ª de IC sin claves no se ofrece');
  ok(!(await icpayProveedor.credenciales(ds, c, { id: fIc2.id, proveedor: 'ICPAY', config: { baseUrl: BASE, email: EMAIL2 }, legado: false })),
    'una cuenta nueva NO usa las claves de otra cuenta del mismo proveedor');
  secretos[`ICPAY#${fIc2.id}.apiKey`] = async () => KEY2;
  secretos[`ICPAY#${fIc2.id}.password`] = async () => PASS2;
  ok(ids(await cuentasListas(ds, c, 'DELIVERY')) === `${fBan.id},${fIc1.id},${fIc2.id}`, 'delivery: las tres (dos cuentas de IC Pay a la vez)');
  ok(ids(await cuentasListas(ds, c, 'PICKUP')) === `${fBan.id},${fIc1.id}`, 'retiro: la cuenta «solo delivery» no aparece');
  ok((await cuentasListas(ds, c, 'MESA_QR')).length === 0, 'mesa: nunca se paga online');
  await cargarCredencialesTienda(ds);
  ok(pagoOnlineOfrecido(c) && proveedoresPagoListos().map((p) => `${p.formaId}:${p.id}:${p.etiqueta}:${p.pickup ? 'R' : ''}${p.delivery ? 'D' : ''}`).join()
    === `${fBan.id}:BANCARD:TARJETA — BANCARD:RD,${fIc1.id}:ICPAY:PIX (BRASIL):RD,${fIc2.id}:ICPAY:PIX SUCURSAL 2:D`, 'la tienda publica cada cuenta con su nombre y tipos', proveedoresPagoListos());

  console.log('Cada pedido con su cuenta');
  const p10 = await nuevo(6350);
  await repo.update({ id: p10.id }, { formaPagoOnlineId: fIc2.id } as any);
  const antes10 = llamadas.length;
  const i10: any = await iniciarPagoPedido(ds, p10.id);
  const crear10 = llamadas.slice(antes10).find((l) => l.metodo === 'POST' && l.ruta === '/api/v1/payment/order');
  ok(i10.success && crear10?.headers['x-api-key'] === KEY2, 'el pedido de la cuenta 2 se cobra con las claves de la cuenta 2', crear10?.headers);
  await formaRepo.update({ id: fIc2.id }, { activo: false } as any);
  ordenes.get((await leer(p10.id)).pagoSesionId!)!.status = 'completed';
  const v10 = await verificarPagoPedido(ds, p10.id);
  ok(v10.estadoPago === EstadoPagoOnline.PAGADO, 'desactivar la cuenta no deja colgados sus pedidos: se siguen consultando con ella', v10);
  ok(ids(await cuentasListas(ds, c, 'DELIVERY')) === `${fBan.id},${fIc1.id}`, 'la cuenta desactivada ya no se ofrece');
  const p11 = await nuevo(6350);
  const i11: any = await iniciarPagoPedido(ds, p11.id);
  ok(i11.success && (await leer(p11.id)).formaPagoOnlineId === fIc1.id, 'pedido sin cuenta (de antes): toma la primera cuenta lista de su proveedor y la guarda');

  console.log('Cuenta convertida por la migración (_legado)');
  const fLeg = await crearForma({ proveedor: 'ICPAY', nombre: 'PIX LEGADO', orden: 4, configJson: JSON.stringify({ baseUrl: BASE, email: EMAIL, _legado: '1' }) });
  secretos['ICPAY.apiKey'] = async () => KEY;
  secretos['ICPAY.password'] = async () => PASS;
  ok(ids(await cuentasListas(ds, c)).split(',').includes(String(fLeg.id)), 'la cuenta _legado sigue usando las claves de antes (no hay que volver a cargarlas)');

  console.log('Aviso de una cuenta');
  ok((await procesarAvisoPago(ds, `BANCARD-${fBan.id}`, { operation: { shop_process_id: 'x' } })).http === 400, 'aviso a la URL de una cuenta: se verifica con esa cuenta (inválido → 400)');
  ok((await procesarAvisoPago(ds, 'BANCARD-999999', {})).http === 503, 'aviso a una cuenta que no existe → no se procesa');

  console.log('Cambiar de medio tras un fallo');
  const p8 = await nuevo(64000, 'BANCARD');
  await repo.update({ id: p8.id }, { formaPagoOnlineId: fBan.id, pagoSesionId: String(p8.id * 100 + 1), pagoIntento: 1, pagoProveedor: 'BANCARD', estadoPago: EstadoPagoOnline.PENDIENTE, pagoCheckoutUrl: 'proc-x' } as any);
  const i8a: any = await iniciarPagoPedido(ds, p8.id, { nuevoIntento: true, formaPagoOnlineId: fIc1.id });
  ok(!i8a.success && i8a.error === 'pago_en_curso', 'con un intento pendiente no se cambia de medio (dos cobros vivos)', i8a);
  await repo.update({ id: p8.id }, { estadoPago: EstadoPagoOnline.FALLIDO } as any);
  const i8: any = await iniciarPagoPedido(ds, p8.id, { nuevoIntento: true, formaPagoOnlineId: fIc1.id });
  q = await leer(p8.id);
  ok(i8.success && i8.tipo === 'QR' && q.metodoPago === 'ICPAY' && q.pagoProveedor === 'ICPAY' && q.formaPagoOnlineId === fIc1.id && q.pagoIntento === 2,
    'tras el rechazo de la tarjeta → paga con la cuenta Pix elegida (intento 2)', { i8, q });
  ok((await datosDe(p8.id))?.usd === usdDesdeGuaranies(64000, PYG_POR_USD).toFixed(2), 'el intento nuevo guarda sus datos de IC');
  const p9 = await nuevo(10000, 'ICPAY');
  await repo.update({ id: p9.id }, { formaPagoOnlineId: fIc1.id, pagoSesionId: 'ord-x', pagoIntento: 1, pagoProveedor: 'ICPAY', estadoPago: EstadoPagoOnline.FALLIDO, pagoCheckoutUrl: 'qr:ord-x' } as any);
  const i9: any = await iniciarPagoPedido(ds, p9.id, { nuevoIntento: true, formaPagoOnlineId: fIc2.id });
  ok(!i9.success && i9.error === 'pago_online_no_disponible' && (await leer(p9.id)).formaPagoOnlineId === fIc1.id, 'a una cuenta desactivada → no se cambia', i9);

  await ds.destroy();
  console.log(`\n[pagos-icpay] ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
