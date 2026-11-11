/**
 * Pago online con uPay (PLAN-tienda-online F4) contra un uPay simulado (fetch inyectado).
 * SQLite por defecto; Postgres con TIENDA_PG=<base> (127.0.0.1, PGUSER o postgres).
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
import { EstadoPagoOnline, EstadoPedidoOnline, MetodoPagoOnline, TipoPedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import {
  iniciarPagoPedido, verificarPagoPedido, tickPagosOnline, setPagosOnlineDeps, marcarReembolsoSiPagado,
  marcarDevuelto, pagoOnlineDisponible, VERIFICAR_MIN_MS,
} from '../electron/services/pagos-online/pagos-online.service';
import { esUrlCheckoutUpay } from '../electron/services/pagos-online/upay-checkout.provider';
import { interpretarPago } from '../electron/services/pagos-online/interpretar-pago';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

// ── uPay simulado ──
interface Ses { id: string; status: string; paymentId?: string; amount: string; ref: string; idem: string }
const sesiones = new Map<string, Ses>();
const pagos = new Map<string, any>();
const llamadas: Array<{ metodo: string; url: string; headers: any; body: any }> = [];
let respuestaForzada: { status: number; body: any } | null = null;
let n = 0;
const fakeFetch = async (url: string, init: any = {}) => {
  const body = init.body ? JSON.parse(init.body) : null;
  llamadas.push({ metodo: init.method, url, headers: init.headers, body });
  const res = (status: number, b: any) => ({ status, text: async () => JSON.stringify(b) });
  if (respuestaForzada) return res(respuestaForzada.status, respuestaForzada.body);
  if (init.headers['X-Api-Key'] !== 'k-test') return res(401, { error: 'AUTHORIZATION_DENIED' });
  const u = new URL(url);
  if (init.method === 'POST' && u.pathname === '/v1/payments/checkout-sessions') {
    const idem = init.headers['Idempotency-Key'];
    const prev = [...sesiones.values()].find((s) => s.idem === idem);
    if (prev) return res(201, { sessionId: prev.id, checkoutUrl: `https://checkout.online-payments.upay.com/${prev.id}`, expiresAt: new Date(Date.now() + 7200_000).toISOString() });
    if ([...sesiones.values()].some((s) => s.ref === body.merchant.seller.operationReferenceId)) return res(409, { code: 'duplicate_reference_id' });
    const id = `ses-${++n}`;
    sesiones.set(id, { id, status: 'open', amount: body.amount.value, ref: body.merchant.seller.operationReferenceId, idem });
    return res(201, { sessionId: id, checkoutUrl: `https://checkout.online-payments.upay.com/${id}`, expiresAt: new Date(Date.now() + 7200_000).toISOString() });
  }
  let m = u.pathname.match(/^\/v1\/payments\/checkout-sessions\/(.+)$/);
  if (m) {
    const s = sesiones.get(decodeURIComponent(m[1]));
    if (!s) return res(404, { code: 'not_found' });
    return res(200, { sessionId: s.id, status: s.status, paymentId: s.paymentId, amount: { value: s.amount, currency: 'PYG' }, merchant: { referenceId: s.ref } });
  }
  m = u.pathname.match(/^\/v1\/payments\/(.+)\/status$/);
  if (m) {
    const p = pagos.get(decodeURIComponent(m[1]));
    return p ? res(200, p) : res(404, {});
  }
  return res(404, {});
};
function pagar(sesId: string, status = 'SUCCEEDED', sub = 'APPROVED', monto?: string) {
  const s = sesiones.get(sesId)!;
  s.status = 'complete';
  s.paymentId = 'pay-' + sesId;
  pagos.set(s.paymentId, { id: s.paymentId, status, subStatus: sub, amount: { value: monto ?? s.amount, currency: 'PYG' } });
}

const avisos: string[] = [];

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pagos-online.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[pagos-online] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  setPagosOnlineDeps({ fetch: fakeFetch as any, apiKey: async () => 'k-test', avisar: async (t) => { avisos.push(t); } });
  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  let cfg = await cfgRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) cfg = await cfgRepo.save(cfgRepo.create({ activa: true } as any) as any) as TiendaOnlineConfig;
  ok(cfg.pagoOnlineActivo === false, 'pago online nace apagado');
  ok(!(await pagoOnlineDisponible(ds)), 'apagado → no se ofrece');
  await cfgRepo.update({ id: cfg.id }, { pagoOnlineActivo: true, upayMerchantId: 'M-1', upayMerchantNombre: 'Don Franco', aceptacionAutomatica: false } as any);
  ok(await pagoOnlineDisponible(ds), 'activo + merchant + API Key → se ofrece');

  const repo = ds.getRepository(PedidoOnline);
  let seq = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online`))[0].n);
  const nuevo = async (total = 112000, estado = EstadoPedidoOnline.PENDIENTE_PAGO) => repo.save(repo.create({
    numero: `PT-${String(++seq).padStart(5, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado,
    metodoPago: MetodoPagoOnline.UPAY, subtotal: total, costoEnvio: 0, total, items: [],
  } as any) as any) as Promise<PedidoOnline>;
  const leer = (id: number) => repo.findOne({ where: { id } }) as Promise<PedidoOnline>;

  console.log('Funciones puras');
  ok(esUrlCheckoutUpay('https://checkout.online-payments.upay.com/x'), 'redirección a checkout de uPay OK');
  ok(!esUrlCheckoutUpay('http://checkout.upay.com/x'), 'http no');
  ok(!esUrlCheckoutUpay('https://evilupay.com/x'), 'evilupay.com no');
  ok(!esUrlCheckoutUpay('https://upay.com.evil.net/x'), 'upay.com.evil.net no');
  const ses = { status: 'complete', paymentId: 'p', amount: { value: '1000', currency: 'PYG' }, merchant: { referenceId: 'R-1' } };
  ok(interpretarPago(ses, { status: 'PENDING', subStatus: 'AUTHORIZED' }, { monto: 1000, referencia: 'R-1' }).tipo === 'PENDIENTE', 'autorizado sin captura → pendiente');
  ok(interpretarPago(ses, { status: 'RARO', subStatus: 'X' }, { monto: 1000, referencia: 'R-1' }).tipo === 'PENDIENTE', 'estado desconocido → pendiente');
  ok(interpretarPago(ses, { status: 'SUCCEEDED', subStatus: 'PARTIALLY_REFUNDED' }, { monto: 1000, referencia: 'R-1' }).tipo === 'PENDIENTE', 'SUCCEEDED con sub raro → pendiente');
  ok(interpretarPago(ses, { status: 'CANCELED' }, { monto: 1000, referencia: 'R-1' }).tipo === 'FALLIDO', 'CANCELED → fallido');
  ok(interpretarPago(ses, { status: 'SUCCEEDED', subStatus: 'CAPTURED', amount: { value: '1000', currency: 'PYG' } }, { monto: 1000, referencia: 'R-2' }).tipo === 'INCONSISTENTE', 'referencia ajena → no pagado');
  ok(interpretarPago({ status: 'xx' }, null, { monto: 1, referencia: 'a' }).tipo === 'PENDIENTE', 'sesión con estado desconocido → pendiente');

  console.log('Pago aprobado');
  const p1 = await nuevo();
  const i1 = await iniciarPagoPedido(ds, p1.id);
  ok(i1.success && esUrlCheckoutUpay((i1 as any).checkoutUrl), 'crea sesión y devuelve checkoutUrl de uPay', i1);
  const post = llamadas.find((l) => l.metodo === 'POST')!;
  ok(post.headers['X-Api-Key'] === 'k-test' && !post.headers['Authorization'], 'autentica solo con X-Api-Key');
  ok(/^[0-9a-f-]{36}$/.test(post.headers['Idempotency-Key']), 'manda Idempotency-Key UUID');
  ok(post.body.amount.value === '112000' && post.body.amount.currency === 'PYG', 'monto string en PYG = total del servidor', post.body.amount);
  ok(post.body.merchant.seller.operationReferenceId === `${p1.numero}-1`, 'referencia <numero>-1');
  ok(post.body.checkout.successUrl.endsWith(`/tienda/pago/${p1.numero}?r=ok`), 'vuelve a /tienda/pago/<numero>');
  const i1b = await iniciarPagoPedido(ds, p1.id);
  ok((i1b as any).checkoutUrl === (i1 as any).checkoutUrl && sesiones.size === 1, 'doble clic reusa la misma sesión');
  let v = await verificarPagoPedido(ds, p1.id);
  ok(v.estado === EstadoPedidoOnline.PENDIENTE_PAGO && v.estadoPago === EstadoPagoOnline.PENDIENTE, 'sesión abierta → sigue esperando', v);
  const s1 = (await leer(p1.id)).pagoSesionId!;
  pagar(s1);
  v = await verificarPagoPedido(ds, p1.id, { minIntervaloMs: VERIFICAR_MIN_MS });
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE, 'tope de 10 s: no vuelve a consultar enseguida');
  v = await verificarPagoPedido(ds, p1.id);
  ok(v.recienPagado === true && v.estado === EstadoPedidoOnline.RECIBIDO && v.estadoPago === EstadoPagoOnline.PAGADO, 'complete + SUCCEEDED/APPROVED → PAGADO y RECIBIDO', v);
  const q1 = await leer(p1.id);
  ok(q1.pagoId === `pay-${s1}` && Number(q1.pagoMonto) === 112000 && !!q1.pagadoEn, 'guarda paymentId, monto y fecha');
  const v2 = await verificarPagoPedido(ds, p1.id);
  ok(!v2.recienPagado, 'verificar de nuevo no lo vuelve a pagar');
  const [v3, v4] = await Promise.all([verificarPagoPedido(ds, p1.id), verificarPagoPedido(ds, p1.id)]);
  ok(!v3.recienPagado && !v4.recienPagado, 'verificaciones concurrentes sobre un pagado: nada');

  console.log('Concurrencia en la confirmación');
  const pc = await nuevo();
  await iniciarPagoPedido(ds, pc.id);
  pagar((await leer(pc.id)).pagoSesionId!);
  const rs = await Promise.all([verificarPagoPedido(ds, pc.id), verificarPagoPedido(ds, pc.id), verificarPagoPedido(ds, pc.id)]);
  ok(rs.filter((r) => r.recienPagado).length === 1, 'tres confirmaciones a la vez → un solo pago', rs);

  console.log('Rechazado por el banco y reintento');
  const p2 = await nuevo(50000);
  await iniciarPagoPedido(ds, p2.id);
  const s2 = (await leer(p2.id)).pagoSesionId!;
  ok((await iniciarPagoPedido(ds, p2.id, { nuevoIntento: true }) as any).error === 'pago_en_curso', 'con sesión abierta no se abre otra');
  pagar(s2, 'DECLINED', 'DECLINED');
  v = await verificarPagoPedido(ds, p2.id);
  ok(v.estadoPago === EstadoPagoOnline.FALLIDO && v.estado === EstadoPedidoOnline.PENDIENTE_PAGO, 'DECLINED → FALLIDO, el pedido no avanza', v);
  const i2 = await iniciarPagoPedido(ds, p2.id, { nuevoIntento: true });
  const q2 = await leer(p2.id);
  ok(i2.success && q2.pagoIntento === 2 && q2.pagoSesionId !== s2, 'reintento abre sesión nueva (intento 2)', q2);
  ok(sesiones.get(q2.pagoSesionId!)!.ref === `${p2.numero}-2`, 'referencia del intento 2');
  pagar(q2.pagoSesionId!);
  v = await verificarPagoPedido(ds, p2.id);
  ok(v.recienPagado === true, 'el intento 2 se paga');

  console.log('Monto que no coincide');
  const p3 = await nuevo(80000);
  await iniciarPagoPedido(ds, p3.id);
  pagar((await leer(p3.id)).pagoSesionId!, 'SUCCEEDED', 'APPROVED', '8000');
  avisos.length = 0;
  v = await verificarPagoPedido(ds, p3.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && !v.recienPagado, 'monto distinto → no se da por pagado', v);
  ok(avisos.some((a) => a.includes(p3.numero) && a.includes('no coincide')), 'y se avisa al personal');

  console.log('Vencimiento, última consulta y pago tardío');
  const p4 = await nuevo(30000);
  await iniciarPagoPedido(ds, p4.id);
  const s4 = (await leer(p4.id)).pagoSesionId!;
  sesiones.get(s4)!.status = 'expired';
  const r4 = await tickPagosOnline(ds, { ahora: new Date(Date.now() + 1000) });
  let q4 = await leer(p4.id);
  ok(r4.consultados >= 1 && q4.estadoPago === EstadoPagoOnline.EXPIRADO && q4.estado === EstadoPedidoOnline.CANCELADO, 'sesión expired → EXPIRADO y pedido CANCELADO', q4);
  pagar(s4);
  avisos.length = 0;
  await repo.update({ id: p4.id }, { pagoUltimaConsulta: new Date(Date.now() - 600_000) } as any);
  await tickPagosOnline(ds, { ahora: new Date() });
  q4 = await leer(p4.id);
  ok(q4.estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE && q4.estado === EstadoPedidoOnline.CANCELADO, 'pago que llega tarde → REEMBOLSO_PENDIENTE, no revive el pedido', q4);
  ok(avisos.some((a) => a.includes(p4.numero) && a.includes('devolver')), 'aviso de devolver al personal');
  ok(await marcarDevuelto(ds, p4.id) && (await leer(p4.id)).estadoPago === EstadoPagoOnline.DEVUELTO, 'el personal lo marca devuelto');

  const p5 = await nuevo(20000);
  await iniciarPagoPedido(ds, p5.id);
  const s5 = (await leer(p5.id)).pagoSesionId!;
  await repo.update({ id: p5.id }, { pagoExpiraEn: new Date(Date.now() - 1000), pagoUltimaConsulta: new Date(Date.now() - 5000) } as any);
  pagar(s5); // pagó en el último segundo
  await tickPagosOnline(ds, { ahora: new Date() });
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.PAGADO, 'vencida la sesión: la última consulta encuentra el pago y lo confirma');

  console.log('Aceptación automática, rechazo del local y aviso sin aceptar');
  await cfgRepo.update({ id: cfg.id }, { aceptacionAutomatica: true } as any);
  const p6 = await nuevo(45000);
  await iniciarPagoPedido(ds, p6.id);
  pagar((await leer(p6.id)).pagoSesionId!);
  const materializados: number[] = [];
  await repo.update({ id: p6.id }, { pagoUltimaConsulta: null } as any);
  await tickPagosOnline(ds, { alPagar: async (id) => { materializados.push(id); } });
  ok((await leer(p6.id)).estado === EstadoPedidoOnline.ACEPTADO && materializados.includes(p6.id), 'con aceptación automática: ACEPTADO y se materializa');
  await cfgRepo.update({ id: cfg.id }, { aceptacionAutomatica: false } as any);
  const monto = await marcarReembolsoSiPagado(ds, p1.id);
  ok(monto === 112000 && (await leer(p1.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE, 'rechazo de un pagado → REEMBOLSO_PENDIENTE con el monto');
  ok((await marcarReembolsoSiPagado(ds, p3.id)) === null, 'rechazo de uno sin pagar no marca reembolso');
  avisos.length = 0;
  await repo.update({ id: p2.id }, { pagadoEn: new Date(Date.now() - 21 * 60_000) } as any);
  await tickPagosOnline(ds);
  await tickPagosOnline(ds);
  ok(avisos.filter((a) => a.includes(p2.numero) && a.includes('sin aceptar')).length === 1, 'pagado sin aceptar a los 20 min → un solo aviso', avisos);

  console.log('Interruptor apagado y credenciales');
  await cfgRepo.update({ id: cfg.id }, { pagoOnlineActivo: false } as any);
  ok(!(await pagoOnlineDisponible(ds)), 'apagado: no se ofrece a pedidos nuevos');
  const p7 = await nuevo(10000);
  await cfgRepo.update({ id: cfg.id }, { pagoOnlineActivo: true } as any);
  await iniciarPagoPedido(ds, p7.id);
  await cfgRepo.update({ id: cfg.id }, { pagoOnlineActivo: false } as any);
  pagar((await leer(p7.id)).pagoSesionId!);
  v = await verificarPagoPedido(ds, p7.id);
  ok(v.recienPagado === true, 'apagado: un pago en curso se sigue confirmando');
  await cfgRepo.update({ id: cfg.id }, { pagoOnlineActivo: true } as any);
  setPagosOnlineDeps({ apiKey: async () => 'mala' });
  const p8 = await nuevo(10000);
  const i8 = await iniciarPagoPedido(ds, p8.id);
  ok(!i8.success && (i8 as any).error === 'upay_credenciales' && (await leer(p8.id)).estadoPago == null, '401 → error claro, sin sesión ni pago', i8);
  setPagosOnlineDeps({ apiKey: async () => 'k-test' });
  respuestaForzada = { status: 503, body: {} };
  const p9 = await nuevo(10000);
  ok(!(await iniciarPagoPedido(ds, p9.id)).success, '503 al crear → no hay sesión');
  respuestaForzada = null;
  await iniciarPagoPedido(ds, p9.id);
  respuestaForzada = { status: 500, body: {} };
  v = await verificarPagoPedido(ds, p9.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && v.error === 'upay_error', 'uPay caído al consultar → sigue pendiente', v);
  respuestaForzada = null;
  const ev = await ds.getRepository(PagoOnlineEvento).find();
  ok(ev.length > 10 && ev.every((e) => !String(e.respuesta || '').includes('k-test')), 'eventos registrados y sin la API Key', ev.length);
  ok((await iniciarPagoPedido(ds, (await nuevo(1000, EstadoPedidoOnline.RECIBIDO)).id) as any).error === 'pedido_no_espera_pago', 'no inicia pago de un pedido que no lo espera');

  await ds.destroy();
  console.log(`\n${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
