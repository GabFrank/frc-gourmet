/**
 * Pago online con dinelco Checkout embebido (PLAN-tienda-pagos-dinelco) contra un dinelco SIMULADO
 * que responde como el sandbox real (probado el 2026-11-25). Sin red.
 *
 * Uso: npm run test:pagos-dinelco   ·   TIENDA_PG=<base vacía> … (Postgres)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import Fastify from 'fastify';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { PedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PagoOnlineEvento } from '../src/app/database/entities/pedidos-online/pago-online-evento.entity';
import { TiendaOnlineConfig } from '../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, FORMA_PAGO_DINELCO, TipoPedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import {
  iniciarPagoPedido, verificarPagoPedido, setPagosOnlineDeps, pagoOnlineDisponible, procesarAvisoPago,
  registrarDecisionPago,
} from '../electron/services/pagos-online/pagos-online.service';
import { dinelcoProveedor, interpretarSesionDinelco } from '../electron/services/pagos-online/proveedores/dinelco.proveedor';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const KEY = 'di_sk_' + 'a'.repeat(48) + '_1234abcd';
const HOST = 'test-checkout.dinelco.com.py';

// ── dinelco simulado ──
interface Sesion { sessionId: number; ref: string; amount: number; token: string; body: any; payment?: any; brand?: string }
const sesiones = new Map<number, Sesion>();
const llamadas: Array<{ metodo: string; ruta: string; body: any; auth: string }> = [];
let reversa: 'OK' | 'VENCIDA' | 'MARCA' | 'RED' = 'OK';
let sid = 17000;
let op = 526124790000;
const fakeFetch = async (url: string, init: any = {}) => {
  const res = (status: number, b: any) => ({ status, text: async () => (b == null ? '' : JSON.stringify(b)) });
  const u = new URL(url);
  if (u.host !== HOST) return res(404, { message: 'otro host' });
  const body = init.body ? JSON.parse(init.body) : null;
  const ruta = u.pathname.replace('/dinelco-checkout/api/v1', '');
  const auth = String(init.headers?.Authorization || '');
  llamadas.push({ metodo: init.method || 'GET', ruta: ruta + u.search, body, auth });
  if (auth !== `Bearer ${KEY}`) return res(401, { message: 'Invalid or expired API Key', errorCode: 'UNAUTHORIZED' });
  if (ruta === '/checkout-session' && init.method === 'POST') {
    if (!body?.amount || body.currency !== 'PYG' || !body.targetOrigin) return res(400, { statusCode: 400, message: ['amount/currency/targetOrigin'], error: 'Bad Request' });
    if (body.callbackUrl && !/^https?:\/\/[^/]+\.[a-z]{2,}/i.test(body.callbackUrl)) return res(400, { statusCode: 400, message: ['callbackUrl'], error: 'Bad Request' });
    const s: Sesion = { sessionId: ++sid, ref: body.clientReferenceId, amount: body.amount, token: `tok-${sid}-secreto`, body };
    sesiones.set(s.sessionId, s);
    return res(201, { integrityToken: s.token, expirationDate: new Date(Date.now() + 10 * 60_000).toISOString(), sessionId: s.sessionId });
  }
  const vista = (s: Sesion) => ({
    sessionId: s.sessionId, sessionStatus: s.payment?.status === 'APPROVED' || s.payment?.status === 'VOIDED' ? 'SUCCESS' : 'REQUIRES_PAYMENT',
    uiMode: 'EMBEDDED', clientReferenceId: s.ref, metadata: s.body.metadata || {},
    merchantInfo: { name: 'Bepsa Prueba' },
    ...(s.payment ? { payment: s.payment, paymentInfo: { paymentMethodType: 'CARD', paymentMethodPayload: { cardBrand: s.brand || 'VISA', cardNumber: '445653******1005' } } } : {}),
    customer: { name: 'Pagador', email: 'pagador@ejemplo.com' },
  });
  const m = ruta.match(/^\/checkout-session\/(\d+)$/);
  if (m && init.method !== 'POST') {
    const s = sesiones.get(Number(m[1]));
    return s ? res(200, vista(s)) : res(404, { message: 'checkout session is not found', errorCode: 'NOT_FOUND' });
  }
  if (ruta === '/checkout-session' && u.searchParams.get('clientReferenceId')) {
    const s = [...sesiones.values()].find((x) => x.ref === u.searchParams.get('clientReferenceId'));
    return s ? res(200, vista(s)) : res(404, { message: 'checkout session is not found', errorCode: 'NOT_FOUND' });
  }
  if (ruta === '/payment/reversal' && init.method === 'POST') {
    if (reversa === 'RED') throw new Error('timeout');
    const s = [...sesiones.values()].find((x) => x.payment?.operationNumber === body?.operationNumber);
    if (!s || s.payment.status !== 'APPROVED') return res(400, { message: 'El pago no fue encontrado o ya ha sido revertido', errorCode: 'APPROVED_PAYMENT_NOT_FOUND_FOR_REVERSAL' });
    if (reversa === 'VENCIDA') return res(400, { message: 'Tiempo limite para revertir excedido', errorCode: 'APPROVED_PAYMENT_NOT_FOUND_FOR_REVERSAL' });
    if (reversa === 'MARCA') return res(400, { message: 'La marca de tarjeta DIN no es soportada para reversión', errorCode: 'CARD_BRAND_NOT_SUPPORTED_FOR_REVERSAL' });
    s.payment = { ...s.payment, status: 'VOIDED' };
    return res(200, { paymentId: s.payment.id, clientReferenceId: s.ref, paymentStatus: 'VOIDED', amount: s.amount, currency: 'PYG', reversal: { id: 'R1', message: 'ok', status: 'APPROVED', responseCode: '0000' }, operationNumber: s.payment.operationNumber });
  }
  return res(404, { message: 'ruta' });
};
function pagar(s: Sesion | undefined, opts: { status?: string; amount?: number; currency?: string } = {}) {
  if (!s) throw new Error('sin sesión');
  const st = opts.status ?? 'APPROVED';
  const n = String(++op);
  s.payment = {
    id: op, status: st, message: st === 'APPROVED' ? 'Pago realizado con éxito' : 'Rechazado', extendedMessage: st === 'APPROVED' ? 'APROBADO' : 'FONDOS INSUFICIENTES',
    operationNumber: st === 'REJECTED' ? null : n, authorizationCode: st === 'REJECTED' ? null : n.slice(-6),
    amount: opts.amount ?? s.amount, currency: opts.currency ?? 'PYG', transactionDate: new Date().toISOString(),
  };
  return s.payment;
}
const avisoPago = (s: Sesion) => ({ message: 'x', clientReferenceId: s.ref, metadata: s.body.metadata, payment: { status: s.payment?.status ?? 'PROCESSING' }, customer: { name: 'Pagador' } });

const avisos: string[] = [];

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pagos-dinelco.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[pagos-dinelco] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  let key = KEY;
  setPagosOnlineDeps({ fetch: fakeFetch as any, apiKey: async () => '', avisar: async (t) => { avisos.push(t); }, secretos: { 'DINELCO.apiKey': async () => key } });
  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  let cfg = await cfgRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) cfg = await cfgRepo.save(cfgRepo.create({ activa: true } as any) as any) as TiendaOnlineConfig;
  const conDinelco = (extra: any = {}) => cfgRepo.update({ id: cfg!.id }, {
    pagoOnlineActivo: true, pagoProveedor: 'DINELCO', aceptacionAutomatica: false,
    pagoConfigJson: JSON.stringify({ DINELCO: { entorno: 'PRUEBA' } }), ...extra,
  } as any);

  console.log('Migración');
  const fp = await ds.query(`SELECT "activo" FROM "formas_pago" WHERE "nombre" = '${FORMA_PAGO_DINELCO}'`);
  ok(fp.length === 1 && !Number(fp[0].activo) && fp[0].activo !== true, 'forma de pago DINELCO ONLINE sembrada inactiva', fp);

  console.log('Funciones puras');
  const ahora = new Date();
  const ses = (p: any) => ({ clientReferenceId: 'FRCG-101-abcdef', payment: p });
  const esp = { referencia: 'FRCG-101-abcdef', monto: 50000, ahora };
  ok(interpretarSesionDinelco(ses({ status: 'APPROVED', operationNumber: '1', amount: 50000, currency: 'PYG' }), esp).tipo === 'PAGADO', 'APPROVED con monto y PYG → PAGADO');
  ok(interpretarSesionDinelco(ses({ status: 'APPROVED', operationNumber: '1', amount: 49999, currency: 'PYG' }), esp).tipo === 'INCONSISTENTE', 'otro monto → INCONSISTENTE');
  ok(interpretarSesionDinelco(ses({ status: 'APPROVED', operationNumber: '1', amount: 50000, currency: 'USD' }), esp).tipo === 'INCONSISTENTE', 'otra moneda → INCONSISTENTE');
  ok(interpretarSesionDinelco(ses({ status: 'APPROVED', operationNumber: null, amount: 50000, currency: 'PYG' }), esp).tipo === 'INCONSISTENTE', 'aprobado sin operación → INCONSISTENTE');
  ok(interpretarSesionDinelco({ ...ses({ status: 'APPROVED', operationNumber: '1', amount: 50000, currency: 'PYG' }), clientReferenceId: 'FRCG-999-abcdef' }, esp).tipo === 'INCONSISTENTE', 'otra referencia → INCONSISTENTE');
  ok(interpretarSesionDinelco(ses({ status: 'REJECTED' }), esp).tipo === 'FALLIDO', 'REJECTED → FALLIDO');
  ok(interpretarSesionDinelco(ses({ status: 'PROCESSING' }), esp).tipo === 'PENDIENTE', 'PROCESSING → PENDIENTE');
  ok(interpretarSesionDinelco(ses({ status: 'VOIDED', operationNumber: '1' }), esp).tipo === 'INCONSISTENTE', 'VOIDED → INCONSISTENTE (no se da por pagado)');
  ok(interpretarSesionDinelco(ses(undefined), esp).tipo === 'PENDIENTE', 'sin pago → PENDIENTE');
  ok(interpretarSesionDinelco(ses(undefined), { ...esp, expiraEn: new Date(ahora.getTime() - 31 * 60_000) }).tipo === 'EXPIRADO', 'sin pago y vencido + 30 min → EXPIRADO');

  console.log('Configuración');
  await conDinelco();
  ok(await pagoOnlineDisponible(ds), 'dinelco con clave → se ofrece');
  key = '';
  ok(!(await pagoOnlineDisponible(ds)), 'sin clave → no se ofrece');
  key = KEY;
  ok((await dinelcoProveedor.probarConexion({ apiKey: KEY, entorno: 'PRUEBA' }, { fetch: fakeFetch as any })).ok, 'probar conexión: 404 de una referencia inexistente → ok');
  ok((await dinelcoProveedor.probarConexion({ apiKey: 'di_sk_mala', entorno: 'PRUEBA' }, { fetch: fakeFetch as any })).error === 'dinelco_credenciales', 'clave rechazada → dinelco_credenciales');
  ok(dinelcoProveedor.datosPortal!('https://app.frc-gourmet.com', 3)[0].valor === 'https://app.frc-gourmet.com/pub/pagos/dinelco-3/aviso', 'URL de aviso por cuenta');

  const repo = ds.getRepository(PedidoOnline);
  let seq = 0;
  const nuevo = async (total = 112000, estado = EstadoPedidoOnline.PENDIENTE_PAGO) => repo.save(repo.create({
    numero: `PD-${String(++seq).padStart(5, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado, pagoModalidad: 'ONLINE',
    metodoPago: 'DINELCO', subtotal: total, costoEnvio: 0, total, items: [],
  } as any) as any) as Promise<PedidoOnline>;
  const leer = (id: number) => repo.findOne({ where: { id } }) as Promise<PedidoOnline>;
  const datos = async (id: number) => JSON.parse((await repo.createQueryBuilder('p').addSelect('p.pagoDatosJson').where('p.id = :id', { id }).getOne())?.pagoDatosJson || 'null');
  const eventos = async (id: number) => (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: id } })).map((e) => `${e.tipo}:${e.estadoProveedor ?? ''}`);
  const ultima = () => [...sesiones.values()][sesiones.size - 1];

  console.log('Cobro con iframe');
  const p1 = await nuevo();
  const i1: any = await iniciarPagoPedido(ds, p1.id);
  const s1 = ultima();
  ok(i1.success && i1.tipo === 'IFRAME' && i1.token === s1.token && i1.validarUrl === `https://${HOST}/d/api/checkout-session/validate`, 'crea la sesión y devuelve token y URL de validación', i1);
  ok(i1.hosts.includes(HOST) && i1.proveedor === 'DINELCO', 'devuelve los hosts de dinelco', i1.hosts);
  ok(/^FRCG-\d+-[0-9a-f]{6}$/.test(s1.ref) && s1.ref.startsWith(`FRCG-${p1.id * 100 + 1}-`), 'referencia FRCG-<intento>-<azar>', s1.ref);
  ok(s1.body.amount === 112000 && s1.body.currency === 'PYG' && s1.body.targetOrigin === 'https://app.frc-gourmet.com', 'monto, moneda y origen', s1.body);
  ok(s1.body.callbackUrl === 'https://app.frc-gourmet.com/pub/pagos/dinelco/aviso' && s1.body.returnUrl.endsWith(`/tienda/pago/${p1.numero}`), 'URL de aviso y de vuelta', s1.body);
  ok(!s1.body.customer && !s1.body.lineItems, 'no manda datos del cliente ni ítems');
  ok(llamadas.every((l) => !JSON.stringify(l.body ?? {}).includes(KEY)), 'la clave va solo en la cabecera');
  let q = await leer(p1.id);
  ok(q.pagoSesionId === String(p1.id * 100 + 1) && q.estadoPago === EstadoPagoOnline.PENDIENTE && q.pagoProveedor === 'DINELCO', 'el pedido guarda el intento y queda pendiente', q);
  const crudos1 = (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: p1.id } })).map((e) => e.respuesta || '').join(' ');
  ok(!crudos1.includes(s1.token), 'el token no queda en el historial');
  const antes = llamadas.length;
  const i1b: any = await iniciarPagoPedido(ds, p1.id);
  ok(i1b.token === i1.token && llamadas.length === antes, 'recarga con token vigente: mismo formulario, sin llamar a dinelco');
  let v = await verificarPagoPedido(ds, p1.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && !v.error, 'antes de pagar → pendiente', v);
  pagar(s1);
  v = await verificarPagoPedido(ds, p1.id);
  q = await leer(p1.id);
  ok(v.recienPagado === true && q.estadoPago === EstadoPagoOnline.PAGADO && q.pagoId === s1.payment.operationNumber && Number(q.pagoMonto) === 112000, 'aprobado → PAGADO con el número de operación', q);
  const crudos1b = (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: p1.id } })).map((e) => e.respuesta || '').join(' ');
  ok(!crudos1b.includes('pagador@ejemplo.com'), 'el historial no guarda datos del pagador');

  console.log('Aviso de dinelco (sin firma: solo dispara la consulta)');
  const p2 = await nuevo(50000);
  await iniciarPagoPedido(ds, p2.id);
  const s2 = ultima();
  let a: any = await procesarAvisoPago(ds, 'DINELCO', { ...avisoPago(s2), payment: { status: 'APPROVED' } });
  ok(a.http === 200 && (await leer(p2.id)).estadoPago === EstadoPagoOnline.PENDIENTE, 'aviso «aprobado» falso (dinelco no tiene el pago) → nada cambia', a);
  pagar(s2);
  a = await procesarAvisoPago(ds, 'DINELCO', avisoPago(s2));
  ok(a.http === 200 && a.resultado?.recienPagado && (await leer(p2.id)).estadoPago === EstadoPagoOnline.PAGADO, 'aviso real → consulta y queda pagado', a);
  ok((await eventos(p2.id)).some((e) => e.startsWith('CONSULTA:PAGADO')), 'queda la consulta que lo confirmó');
  a = await procesarAvisoPago(ds, 'DINELCO', { clientReferenceId: 'FRCG-999999-abcdef' });
  const a2: any = await procesarAvisoPago(ds, 'DINELCO', { clientReferenceId: 'otra-cosa' });
  ok(a.http === 200 && a2.http === 200 && JSON.stringify(a.respuesta) === JSON.stringify(a2.respuesta), 'referencia desconocida o mal formada → la misma respuesta 200, sin efecto', [a, a2]);

  console.log('Rechazo, reintento y aprobado tardío');
  const p3 = await nuevo(30000);
  await iniciarPagoPedido(ds, p3.id);
  const s3 = ultima();
  pagar(s3, { status: 'REJECTED' });
  v = await verificarPagoPedido(ds, p3.id);
  ok(v.estadoPago === EstadoPagoOnline.FALLIDO, 'rechazado → FALLIDO', v);
  // dinelco deja reintentar en el mismo iframe: si igual paga ahí, entra.
  pagar(s3);
  v = await verificarPagoPedido(ds, p3.id);
  ok(v.estadoPago === EstadoPagoOnline.PAGADO, 'aprobado después en la misma sesión → PAGADO', v);
  const p3b = await nuevo(31000);
  await iniciarPagoPedido(ds, p3b.id);
  pagar(ultima(), { status: 'REJECTED' });
  await verificarPagoPedido(ds, p3b.id);
  const i3: any = await iniciarPagoPedido(ds, p3b.id, { nuevoIntento: true });
  ok(i3.success && i3.tipo === 'IFRAME' && ultima().ref.startsWith(`FRCG-${p3b.id * 100 + 2}-`) && (await leer(p3b.id)).pagoSesionId === String(p3b.id * 100 + 2), 'reintento → sesión nueva (intento 2)', i3);

  console.log('Token vencido');
  const p4 = await nuevo(45000);
  await iniciarPagoPedido(ds, p4.id);
  const s4 = ultima();
  const d4 = await datos(p4.id);
  await repo.createQueryBuilder().update(PedidoOnline).set({ pagoDatosJson: JSON.stringify({ ...d4, tokenVence: new Date(Date.now() - 1000).toISOString() }) } as any).where('id = :id', { id: p4.id }).execute();
  const i4: any = await iniciarPagoPedido(ds, p4.id);
  const s4b = ultima();
  const d4b = await datos(p4.id);
  ok(i4.success && i4.token === s4b.token && s4b.sessionId !== s4.sessionId && s4b.ref.startsWith(`FRCG-${p4.id * 100 + 1}-`), 'token vencido → otra sesión del MISMO intento', i4);
  ok(d4b.previas?.[0]?.ref === s4.ref && (await leer(p4.id)).pagoSesionId === String(p4.id * 100 + 1), 'la sesión anterior queda en las previas', d4b);
  // El cliente tenía otra pestaña con el formulario viejo y pagó ahí.
  pagar(s4);
  v = await verificarPagoPedido(ds, p4.id);
  ok(v.estadoPago === EstadoPagoOnline.PAGADO && (await leer(p4.id)).pagoId === s4.payment.operationNumber, 'pago en la sesión anterior → PAGADO', v);
  const p5 = await nuevo(46000);
  await iniciarPagoPedido(ds, p5.id);
  const s5 = ultima();
  const d5 = await datos(p5.id);
  await repo.createQueryBuilder().update(PedidoOnline).set({ pagoDatosJson: JSON.stringify({ ...d5, tokenVence: new Date(Date.now() - 1000).toISOString() }) } as any).where('id = :id', { id: p5.id }).execute();
  pagar(s5, { status: 'PROCESSING' });
  const nAntes = sesiones.size;
  const i5: any = await iniciarPagoPedido(ds, p5.id);
  ok(!i5.success && i5.error === 'pago_en_curso' && sesiones.size === nAntes, 'token vencido con un pago en proceso → no abre otra sesión', i5);
  s5.payment = null;
  await iniciarPagoPedido(ds, p5.id);
  const s5b = ultima();
  pagar(s5);
  pagar(s5b);
  avisos.length = 0;
  v = await verificarPagoPedido(ds, p5.id);
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.PENDIENTE && avisos.some((t) => t.includes(p5.numero)), 'dos sesiones aprobadas del mismo pedido → no se da por pagado solo y se avisa', avisos);

  console.log('Monto que no coincide');
  const p6 = await nuevo(40000);
  await iniciarPagoPedido(ds, p6.id);
  pagar(ultima(), { amount: 1000 });
  avisos.length = 0;
  await verificarPagoPedido(ds, p6.id);
  ok((await leer(p6.id)).estadoPago === EstadoPagoOnline.PENDIENTE && avisos.some((t) => t.includes(p6.numero)), 'monto distinto → no se da por pagado y se avisa', avisos);

  console.log('Vencido sin pago');
  const p7 = await nuevo(20000);
  await iniciarPagoPedido(ds, p7.id);
  await repo.update({ id: p7.id }, { pagoExpiraEn: new Date(Date.now() - 31 * 60_000) } as any);
  v = await verificarPagoPedido(ds, p7.id);
  ok(v.estadoPago === EstadoPagoOnline.EXPIRADO, 'pasado el vencimiento sin pago → EXPIRADO', v);

  console.log('Devolución (reversa)');
  await conDinelco({ pagoDevolucionAutomatica: true });
  const nuevoPagado = async (total: number) => {
    const p = await nuevo(total);
    await iniciarPagoPedido(ds, p.id);
    const s = ultima();
    pagar(s);
    await verificarPagoPedido(ds, p.id);
    await repo.update({ id: p.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
    return { p, s };
  };
  const r1 = await nuevoPagado(15000);
  const d1: any = await registrarDecisionPago(ds, r1.p.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  const rev = llamadas.filter((l) => l.ruta === '/payment/reversal').pop();
  ok(d1.devolucionAutomatica?.ok === true && (await leer(r1.p.id)).estadoPago === EstadoPagoOnline.DEVUELTO && r1.s.payment.status === 'VOIDED', 'cancelado con «devolver» → reversa aprobada y DEVUELTO', d1);
  ok(rev?.body?.operationNumber === r1.s.payment.operationNumber && rev?.body?.clientReferenceId === r1.s.ref, 'la reversa va con el número de operación y la referencia', rev?.body);
  const r2 = await nuevoPagado(15100);
  r2.s.payment.status = 'VOIDED';
  const dd2: any = await registrarDecisionPago(ds, r2.p.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  ok(dd2.devolucionAutomatica?.ok === true, 'ya revertido en dinelco → se confirma consultando y queda DEVUELTO', dd2);
  for (const [modo, txt] of [['VENCIDA', 'fuera de 24 h'], ['MARCA', 'marca no habilitada']] as const) {
    reversa = modo;
    const r = await nuevoPagado(15200);
    const d: any = await registrarDecisionPago(ds, r.p.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
    ok(d.devolucionAutomatica?.ok === false && /portal de dinelco/.test(d.devolucionAutomatica.detalle) && (await leer(r.p.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE,
      `${txt} → queda en la cola DEVOLVER («devolvelo desde el portal de dinelco»)`, d);
  }
  reversa = 'OK';

  console.log('Clave rechazada');
  const p8 = await nuevo(12000);
  await iniciarPagoPedido(ds, p8.id);
  key = 'di_sk_otra_clave_que_no_sirve_para_nada';
  v = await verificarPagoPedido(ds, p8.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && !!v.error && (await eventos(p8.id)).some((e) => e === 'ERROR:dinelco_credenciales'), 'clave rechazada al consultar → sigue pendiente y queda el error', v);
  key = KEY;

  console.log('Ruta pública del aviso');
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, () => null);
  const { registerPublicRoutes } = require('../electron/server/public-routes');
  const app = Fastify();
  registerPublicRoutes(app, ds);
  await app.ready();
  const p9 = await nuevo(9000);
  await iniciarPagoPedido(ds, p9.id);
  const s9 = ultima();
  pagar(s9);
  const w1 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', payload: avisoPago(s9) });
  ok(w1.statusCode === 200 && (await leer(p9.id)).estadoPago === EstadoPagoOnline.PAGADO, 'POST /pub/pagos/dinelco/aviso confirma el pago', w1.body);
  const w2 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', payload: { event: 'payment.reversal.approved', data: { clientReferenceId: s9.ref, paymentStatus: 'VOIDED' } } });
  ok(w2.statusCode === 200, 'aviso de reversa (sobre {event, data}) → 200', w2.body);
  const w3 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', payload: { clientReferenceId: 'FRCG-1-ffffff' } });
  ok(w3.statusCode === 200 && w3.body === w1.body, 'referencia desconocida → misma respuesta', w3.body);
  await app.close();

  await ds.destroy();
  console.log(`\n[pagos-dinelco] ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
