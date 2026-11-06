/**
 * Pago online con Bancard vPOS (PLAN-tienda-pagos-proveedores, fase 3) contra un Bancard SIMULADO
 * que valida la clave pública y las firmas md5 como el real. Sin red.
 *
 * Uso: npm run test:pagos-bancard   ·   TIENDA_PG=<base vacía> … (Postgres)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import Fastify from 'fastify';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { PedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.entity';
import { PagoOnlineEvento } from '../src/app/database/entities/pedidos-online/pago-online-evento.entity';
import { TiendaOnlineConfig } from '../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import {
  iniciarPagoPedido, verificarPagoPedido, setPagosOnlineDeps, pagoOnlineDisponible, procesarAvisoPago,
  registrarDecisionPago, tickPagosOnline,
} from '../electron/services/pagos-online/pagos-online.service';
import { interpretarConfirmacionBancard } from '../electron/services/pagos-online/proveedores/interpretar-bancard';
import { montoBancard, tokenConfirmacion } from '../electron/services/pagos-online/proveedores/bancard-vpos.client';
import { bancardProveedor } from '../electron/services/pagos-online/proveedores/bancard.proveedor';
import { invokeHandler, installHandlerRegistry } from '../electron/utils/handler-registry';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const PUB = 'pubKeyTest123';
const PRIV = 'privKeyTest456';
const md5 = (s: string) => createHash('md5').update(s).digest('hex');

// ── Bancard simulado ──
interface Compra { spid: number; amount: string; processId: string; pago?: any; anulada?: boolean }
const compras = new Map<number, Compra>();
const llamadas: Array<{ ruta: string; body: any }> = [];
let anulacionFalla = false;
let anulacionSinRespuesta = false;
/** Se llama durante la anulación, antes de responder (para mirar el estado en ese instante). */
let alAnular: (() => Promise<void>) | null = null;
let n = 0;
const fakeFetch = async (url: string, init: any = {}) => {
  const res = (status: number, b: any) => ({ status, text: async () => JSON.stringify(b) });
  const u = new URL(url);
  if (!u.host.startsWith('vpos.infonet.com.py')) return res(404, { code: 'otro_host', url });
  const body = init.body ? JSON.parse(init.body) : null;
  const ruta = u.pathname.replace('/vpos/api/0.3/', '');
  llamadas.push({ ruta, body });
  const err = (key: string, status = 400) => res(status, { status: 'error', messages: [{ level: 'error', key, dsc: key }] });
  if (body?.public_key !== PUB) return err('InvalidPublicKeyError', 401);
  const op = body.operation || {};
  const spid = Number(op.shop_process_id);
  if (ruta === 'single_buy') {
    if (op.token !== md5(`${PRIV}${spid}${op.amount}${op.currency}`)) return err('InvalidTokenError');
    if (compras.has(spid)) return err('DuplicatedProcessError');
    const processId = `proc-${++n}`;
    compras.set(spid, { spid, amount: op.amount, processId });
    return res(200, { status: 'success', process_id: processId });
  }
  if (ruta === 'single_buy/confirmations') {
    if (op.token !== md5(`${PRIV}${spid}get_confirmation`)) return err('InvalidTokenError');
    const c = compras.get(spid);
    if (!c?.pago) return err('PaymentNotFoundError');
    return res(200, { status: 'success', confirmation: c.pago });
  }
  if (ruta === 'single_buy/rollback') {
    if (op.token !== md5(`${PRIV}${spid}rollback0.00`)) return err('InvalidTokenError');
    if (alAnular) await alAnular();
    if (anulacionSinRespuesta) throw new Error('timeout');
    if (anulacionFalla) return err('PosCommunicationError');
    const c = compras.get(spid);
    if (!c) return err('PaymentNotFoundError');
    if (c.anulada) return err('AlreadyRollbackedError');
    c.anulada = true;
    return res(200, { status: 'success' });
  }
  return res(404, {});
};
/** La confirmación que arma Bancard (firmada con la clave privada del comercio). */
function confirmacion(spid: number, opts: { response?: string; code?: string; amount?: string; priv?: string; currency?: string } = {}) {
  const c = compras.get(spid);
  const amount = opts.amount ?? c?.amount ?? '0.00';
  const currency = opts.currency ?? 'PYG';
  return {
    token: md5(`${opts.priv ?? PRIV}${spid}confirm${amount}${currency}`),
    shop_process_id: spid, response: opts.response ?? 'S', response_details: 'Procesado Satisfactoriamente',
    amount, currency, authorization_number: '123456', ticket_number: `T${spid}`,
    response_code: opts.code ?? '00', response_description: 'Transaccion aprobada',
  };
}
function pagarEnBancard(spid: number, opts: Parameters<typeof confirmacion>[1] = {}) {
  const c = compras.get(spid)!;
  c.pago = confirmacion(spid, opts);
  return c.pago;
}

const avisos: string[] = [];

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pagos-bancard.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[pagos-bancard] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  let priv = PRIV;
  setPagosOnlineDeps({ fetch: fakeFetch as any, apiKey: async () => '', avisar: async (t) => { avisos.push(t); }, secretos: { 'BANCARD.privateKey': async () => priv } });
  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  let cfg = await cfgRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) cfg = await cfgRepo.save(cfgRepo.create({ activa: true } as any) as any) as TiendaOnlineConfig;
  const conBancard = (extra: any = {}) => cfgRepo.update({ id: cfg!.id }, {
    pagoOnlineActivo: true, pagoProveedor: 'BANCARD', aceptacionAutomatica: false,
    pagoConfigJson: JSON.stringify({ BANCARD: { publicKey: PUB, entorno: 'PRUEBA' } }), ...extra,
  } as any);

  console.log('Funciones puras');
  ok(montoBancard(112000) === '112000.00' && montoBancard(10.5) === '10.50', 'monto con dos decimales y punto');
  const esp = { privateKey: PRIV, spid: 501, monto: 1000 };
  const conf = (o: any = {}) => ({ ...{ token: tokenConfirmacion(PRIV, 501, '1000.00'), shop_process_id: 501, response: 'S', response_code: '00', amount: '1000.00', currency: 'PYG', ticket_number: 'T1' }, ...o });
  ok(interpretarConfirmacionBancard(conf(), esp).tipo === 'PAGADO', 'aprobada con firma y monto correctos → PAGADO');
  ok(interpretarConfirmacionBancard(conf({ token: 'x' }), esp).tipo === 'INCONSISTENTE', 'firma falsa → INCONSISTENTE');
  ok(interpretarConfirmacionBancard(conf({ token: undefined }), { ...esp, exigirFirma: true }).tipo === 'INCONSISTENTE', 'aviso sin firma → INCONSISTENTE');
  ok(interpretarConfirmacionBancard(conf({ token: undefined }), esp).tipo === 'PAGADO', 'consulta directa a Bancard sin firma → se acepta (viene por TLS de Bancard)');
  ok(interpretarConfirmacionBancard(conf({ amount: '999.00', token: tokenConfirmacion(PRIV, 501, '999.00') }), esp).tipo === 'INCONSISTENTE', 'otro monto (bien firmado) → INCONSISTENTE');
  ok(interpretarConfirmacionBancard(conf({ currency: 'USD', token: tokenConfirmacion(PRIV, 501, '1000.00', 'USD') }), esp).tipo === 'INCONSISTENTE', 'otra moneda → INCONSISTENTE');
  ok(interpretarConfirmacionBancard(conf({ response: 'N', response_code: '05' }), esp).tipo === 'FALLIDO', 'rechazada → FALLIDO');
  ok(interpretarConfirmacionBancard(conf({ response_code: '99' }), esp).tipo === 'PENDIENTE', 'S con código raro → PENDIENTE');
  ok(interpretarConfirmacionBancard(conf({ shop_process_id: 999 }), esp).tipo === 'INCONSISTENTE', 'de otro proceso → INCONSISTENTE');

  console.log('Configuración');
  await conBancard();
  ok(await pagoOnlineDisponible(ds), 'Bancard con clave pública y privada → se ofrece');
  priv = '';
  ok(!(await pagoOnlineDisponible(ds)), 'sin clave privada → no se ofrece');
  priv = PRIV;
  ok((await bancardProveedor.probarConexion({ publicKey: PUB, privateKey: PRIV, entorno: 'PRUEBA' }, { fetch: fakeFetch as any })).ok, 'probar conexión con claves buenas → ok');
  ok((await bancardProveedor.probarConexion({ publicKey: 'otra', privateKey: PRIV, entorno: 'PRUEBA' }, { fetch: fakeFetch as any })).error === 'bancard_credenciales', 'clave pública rechazada → bancard_credenciales');
  ok(bancardProveedor.datosPortal!('https://app.frc-gourmet.com')[0].valor === 'https://app.frc-gourmet.com/pub/pagos/bancard/aviso', 'URL de confirmación para el portal');

  const repo = ds.getRepository(PedidoOnline);
  let seq = 0;
  const nuevo = async (total = 112000, estado = EstadoPedidoOnline.PENDIENTE_PAGO, metodo = 'BANCARD') => repo.save(repo.create({
    numero: `PB-${String(++seq).padStart(5, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado, pagoModalidad: 'ONLINE',
    metodoPago: metodo, subtotal: total, costoEnvio: 0, total, items: [],
  } as any) as any) as Promise<PedidoOnline>;
  const leer = (id: number) => repo.findOne({ where: { id } }) as Promise<PedidoOnline>;
  const eventos = async (id: number) => (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: id } })).map((e) => `${e.tipo}:${e.estadoProveedor ?? ''}`);

  console.log('Cobro con formulario');
  const p1 = await nuevo();
  const i1: any = await iniciarPagoPedido(ds, p1.id);
  const spid1 = p1.id * 100 + 1;
  ok(i1.success && i1.tipo === 'FORMULARIO' && i1.procesoId === compras.get(spid1)?.processId, 'crea el cobro y devuelve el proceso para el formulario', i1);
  ok(i1.script === 'https://vpos.infonet.com.py:8888/checkout/javascript/dist/bancard-checkout-4.0.0.js', 'script del entorno de prueba', i1.script);
  ok(Array.isArray(i1.hosts) && i1.hosts.includes('vpos.infonet.com.py'), 'devuelve los hosts del proveedor del pedido', i1.hosts);
  const sb = llamadas.find((l) => l.ruta === 'single_buy')!;
  ok(sb.body.operation.amount === '112000.00' && sb.body.operation.shop_process_id === spid1 && !JSON.stringify(sb.body).includes(PRIV),
    'monto, proceso y firma correctos; la clave privada no viaja', sb.body.operation);
  ok(sb.body.operation.return_url.endsWith(`/tienda/pago/${p1.numero}?r=ok`) && sb.body.operation.cancel_url.endsWith('?r=cancelado'), 'vuelve a la página de pago de la tienda');
  let q = await leer(p1.id);
  ok(q.pagoProveedor === 'BANCARD' && q.pagoSesionId === String(spid1) && q.estadoPago === EstadoPagoOnline.PENDIENTE, 'el pedido guarda proveedor, proceso y queda pendiente', q);
  const antes = llamadas.length;
  const i1b: any = await iniciarPagoPedido(ds, p1.id);
  ok(i1b.procesoId === i1.procesoId && llamadas.length === antes, 'doble clic: reusa el proceso vigente sin llamar a Bancard');
  let v = await verificarPagoPedido(ds, p1.id);
  ok(v.estadoPago === EstadoPagoOnline.PENDIENTE && !v.error, 'consulta antes de pagar → sigue pendiente', v);

  console.log('Aviso de Bancard (webhook)');
  const aviso1 = { operation: pagarEnBancard(spid1) };
  let a: any = await procesarAvisoPago(ds, 'BANCARD', aviso1);
  q = await leer(p1.id);
  ok(a.http === 200 && a.respuesta?.status === 'success' && a.resultado?.recienPagado, 'aviso aprobado → responde success y el pedido queda pagado', a);
  ok(q.estadoPago === EstadoPagoOnline.PAGADO && q.estado === EstadoPedidoOnline.RECIBIDO && q.pagoId === `T${spid1}` && Number(q.pagoMonto) === 112000,
    'pagado: RECIBIDO, ticket de Bancard y monto', q);
  ok((await eventos(p1.id)).some((e) => e.startsWith('AVISO:PAGADO')) && (await eventos(p1.id)).some((e) => e.startsWith('CONSULTA:PAGADO')),
    'queda el evento del aviso y el de la consulta que lo confirmó');
  const crudos = (await ds.getRepository(PagoOnlineEvento).find({ where: { pedidoOnlineId: p1.id } })).map((e) => e.respuesta || '').join(' ');
  ok(!crudos.includes(aviso1.operation.token) && !crudos.includes(PRIV), 'el historial no guarda el token del aviso ni la clave privada');
  a = await procesarAvisoPago(ds, 'BANCARD', aviso1);
  ok(a.http === 200 && !a.resultado?.recienPagado && (await leer(p1.id)).estadoPago === EstadoPagoOnline.PAGADO, 'aviso repetido → idempotente');

  const p2 = await nuevo(50000);
  await iniciarPagoPedido(ds, p2.id);
  const spid2 = p2.id * 100 + 1;
  pagarEnBancard(spid2);
  a = await procesarAvisoPago(ds, 'BANCARD', { operation: confirmacion(spid2, { priv: 'robada' }) });
  ok(a.http === 400 && (await leer(p2.id)).estadoPago === EstadoPagoOnline.PENDIENTE, 'aviso con firma falsa → 400 y nada cambia', a);
  a = await procesarAvisoPago(ds, 'BANCARD', { operation: confirmacion(999999) });
  ok(a.http === 400, 'aviso de un proceso que no es nuestro → rechazado', a);
  a = await procesarAvisoPago(ds, 'UPAY', {});
  ok(a.http === 400, 'uPay no recibe avisos por esta vía');

  console.log('Aviso que no dice la verdad');
  const pf = await nuevo(70000);
  await iniciarPagoPedido(ds, pf.id);
  const spidF = pf.id * 100 + 1;
  // Un rechazo legítimo, y alguien que le cambia la respuesta a «aprobado» (el token no la cubre).
  const rechazoReal = { ...confirmacion(spidF, { response: 'N', code: '05' }), amount: compras.get(spidF)!.amount };
  a = await procesarAvisoPago(ds, 'BANCARD', { operation: { ...rechazoReal, response: 'S', response_code: '00' } });
  ok(a.http === 200 && (await leer(pf.id)).estadoPago === EstadoPagoOnline.PENDIENTE,
    'aviso «aprobado» armado sobre un rechazo: Bancard no tiene el pago, el pedido sigue pendiente', a);

  console.log('Aviso perdido: la consulta lo confirma');
  v = await verificarPagoPedido(ds, p2.id);
  ok(v.recienPagado === true && v.estadoPago === EstadoPagoOnline.PAGADO, 'sin aviso, la consulta (single_buy/confirmations) lo da por pagado', v);

  console.log('Rechazo y reintento');
  const p3 = await nuevo(30000);
  await iniciarPagoPedido(ds, p3.id);
  pagarEnBancard(p3.id * 100 + 1, { response: 'N', code: '05' });
  v = await verificarPagoPedido(ds, p3.id);
  ok(v.estadoPago === EstadoPagoOnline.FALLIDO, 'rechazada por el banco → FALLIDO', v);
  const i3: any = await iniciarPagoPedido(ds, p3.id, { nuevoIntento: true });
  ok(i3.success && compras.has(p3.id * 100 + 2) && (await leer(p3.id)).pagoSesionId === String(p3.id * 100 + 2), 'reintento → proceso nuevo (intento 2)', i3);

  console.log('Pago en un intento anterior');
  const pv = await nuevo(33000);
  await iniciarPagoPedido(ds, pv.id);
  pagarEnBancard(pv.id * 100 + 1, { response: 'N', code: '05' });
  await verificarPagoPedido(ds, pv.id);
  await iniciarPagoPedido(ds, pv.id, { nuevoIntento: true });
  // El cliente terminó pagando con otra tarjeta en el proceso viejo.
  a = await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(pv.id * 100 + 1) });
  ok(a.http === 200 && (await leer(pv.id)).estadoPago === EstadoPagoOnline.PAGADO, 'un pago en el intento anterior también cuenta', a);
  avisos.length = 0;
  pagarEnBancard(pv.id * 100 + 2);
  await procesarAvisoPago(ds, 'BANCARD', { operation: compras.get(pv.id * 100 + 2)!.pago });
  ok((await eventos(pv.id)).some((e) => e.startsWith('COBRO_DUPLICADO')) && avisos.some((t) => /segundo cobro/.test(t)),
    'y si además pagó el intento nuevo: se registra el cobro duplicado y se avisa para devolverlo', avisos);

  console.log('Monto que no coincide');
  const p4 = await nuevo(40000);
  await iniciarPagoPedido(ds, p4.id);
  avisos.length = 0;
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(p4.id * 100 + 1, { amount: '1.00' }) });
  ok((await leer(p4.id)).estadoPago === EstadoPagoOnline.PENDIENTE && avisos.some((t) => t.includes(p4.numero) && /no coincide/.test(t)),
    'monto distinto (bien firmado) → no se da por pagado y se avisa', avisos);

  console.log('Pago tardío y devolución automática');
  const p5 = await nuevo(20000);
  await iniciarPagoPedido(ds, p5.id);
  await repo.update({ id: p5.id }, { estado: EstadoPedidoOnline.CANCELADO } as any);
  avisos.length = 0;
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(p5.id * 100 + 1) });
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE && !llamadas.some((l) => l.ruta === 'single_buy/rollback'),
    'sin devolución automática: pago tardío queda para devolver y no se anula solo');
  ok(avisos.some((t) => t.includes(p5.numero) && /devolver/.test(t) && /Bancard/.test(t)), 'avisa que hay que devolver en Bancard', avisos);

  await conBancard({ pagoDevolucionAutomatica: true });
  const p6 = await nuevo(25000);
  await iniciarPagoPedido(ds, p6.id);
  await repo.update({ id: p6.id }, { estado: EstadoPedidoOnline.CANCELADO } as any);
  avisos.length = 0;
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(p6.id * 100 + 1) });
  ok((await leer(p6.id)).estadoPago === EstadoPagoOnline.DEVUELTO && compras.get(p6.id * 100 + 1)?.anulada === true,
    'con devolución automática: el pago tardío se anula en Bancard y queda DEVUELTO');
  ok((await eventos(p6.id)).some((e) => e === 'DEVOLUCION_AUTO:OK') && avisos.some((t) => /automáticamente/.test(t)), 'evento y aviso de la devolución automática', avisos);

  // Cancelar un pedido pagado con «hay que devolverlo» también devuelve solo.
  const p7 = await nuevo(15000);
  await iniciarPagoPedido(ds, p7.id);
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(p7.id * 100 + 1) });
  await repo.update({ id: p7.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
  const d7 = await registrarDecisionPago(ds, p7.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  ok(d7.devolucionAutomatica?.ok === true && d7.montoDevolver === null && (await leer(p7.id)).estadoPago === EstadoPagoOnline.DEVUELTO,
    'cancelado con «hay que devolverlo» → anulado en Bancard, nada que devolver a mano', d7);

  anulacionFalla = true;
  const p8 = await nuevo(15000);
  await iniciarPagoPedido(ds, p8.id);
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(p8.id * 100 + 1) });
  await repo.update({ id: p8.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
  avisos.length = 0;
  const d8 = await registrarDecisionPago(ds, p8.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  ok(d8.devolucionAutomatica?.ok === false && d8.montoDevolver === 15000 && (await leer(p8.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE,
    'si Bancard no la anula, queda en la cola DEVOLVER como siempre', d8);
  ok(avisos.some((t) => /no se pudo/.test(t)) && (await eventos(p8.id)).includes('DEVOLUCION_AUTO:FALLO'), 'y avisa por qué no se pudo', avisos);
  anulacionFalla = false;

  // Mientras se llama a Bancard, el pedido está reclamado: nadie lo resuelve a mano en el medio.
  const pc = await nuevo(14000);
  await iniciarPagoPedido(ds, pc.id);
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(pc.id * 100 + 1) });
  await repo.update({ id: pc.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
  let enMedio: string | null | undefined = null;
  alAnular = async () => { enMedio = (await leer(pc.id)).estadoPago; };
  const { resolverDevolucionPendiente } = require('../electron/services/pagos-online/pagos-online.service');
  let manual: any = null;
  alAnular = async () => {
    enMedio = (await leer(pc.id)).estadoPago;
    manual = await resolverDevolucionPendiente(ds, pc.id, { decision: 'NO_SE_DEVUELVE', motivo: 'X' }, 1);
  };
  await registrarDecisionPago(ds, pc.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  alAnular = null;
  ok(enMedio === 'DEVOLVIENDO' && manual === false && (await leer(pc.id)).estadoPago === EstadoPagoOnline.DEVUELTO,
    'durante la anulación queda DEVOLVIENDO y una resolución manual en ese instante no pisa', { enMedio, manual });

  // Sin respuesta de Bancard: vuelve a la cola y el aviso pide verificar antes de devolver a mano.
  anulacionSinRespuesta = true;
  const ps = await nuevo(13000);
  await iniciarPagoPedido(ds, ps.id);
  await procesarAvisoPago(ds, 'BANCARD', { operation: pagarEnBancard(ps.id * 100 + 1) });
  await repo.update({ id: ps.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
  avisos.length = 0;
  const ds1 = await registrarDecisionPago(ds, ps.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  ok(ds1.devolucionAutomatica?.ok === false && (await leer(ps.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE
    && avisos.some((t) => /verificá/.test(t)) && (await eventos(ps.id)).includes('DEVOLUCION_AUTO:INCIERTO'),
    'sin respuesta: vuelve a DEVOLVER y avisa que hay que verificar en Bancard', avisos);
  anulacionSinRespuesta = false;

  // Una devolución que quedó a medias (el servidor se cortó) vuelve a la cola sola.
  const pt = await nuevo(12500);
  await repo.update({ id: pt.id }, { estadoPago: EstadoPagoOnline.DEVOLVIENDO, pagoProveedor: 'BANCARD' } as any);
  await ds.query(`UPDATE pedidos_online SET updated_at = ${pgDb ? "NOW() - INTERVAL '20 minutes'" : "datetime('now', '-20 minutes')"} WHERE id = ${pt.id}`);
  avisos.length = 0;
  await tickPagosOnline(ds);
  ok((await leer(pt.id)).estadoPago === EstadoPagoOnline.REEMBOLSO_PENDIENTE && avisos.some((t) => t.includes(pt.numero)), 'DEVOLVIENDO trabada → vuelve a la cola con aviso', avisos);
  await conBancard({ pagoDevolucionAutomatica: false });

  console.log('Sesión vencida sin pago');
  const p9 = await nuevo(10000);
  await iniciarPagoPedido(ds, p9.id);
  const vence = new Date(Date.now() - 31 * 60_000);
  await repo.update({ id: p9.id }, { pagoExpiraEn: vence } as any);
  v = await verificarPagoPedido(ds, p9.id);
  q = await leer(p9.id);
  ok(q.estadoPago === EstadoPagoOnline.EXPIRADO && q.estado === EstadoPedidoOnline.CANCELADO, 'sin pago y vencida hace más de 30 min → EXPIRADO y cancelado', q);

  console.log('Cambio de proveedor con pedidos en curso');
  const pu = await nuevo(10000, EstadoPedidoOnline.PENDIENTE_PAGO, 'UPAY');
  await repo.update({ id: pu.id }, { pagoProveedor: 'UPAY', pagoSesionId: 'ses-vieja', estadoPago: EstadoPagoOnline.PENDIENTE } as any);
  const nLlamadas = llamadas.length;
  v = await verificarPagoPedido(ds, pu.id);
  ok(llamadas.length === nLlamadas && v.estadoPago === EstadoPagoOnline.PENDIENTE, 'un pedido de uPay no se consulta a Bancard aunque Bancard sea el activo', v);

  console.log('Job');
  const p10 = await nuevo(12000);
  await iniciarPagoPedido(ds, p10.id);
  pagarEnBancard(p10.id * 100 + 1);
  const t = await tickPagosOnline(ds, { ahora: new Date(Date.now() + 2 * 60_000) });
  ok(t.pagados >= 1 && (await leer(p10.id)).estadoPago === EstadoPagoOnline.PAGADO, 'el job confirma los pagos de Bancard', t);

  console.log('Ruta pública del aviso');
  installHandlerRegistry();
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, () => null);
  const { registerPublicRoutes } = require('../electron/server/public-routes');
  const app = Fastify();
  registerPublicRoutes(app);
  await app.ready();
  const p11 = await nuevo(9000);
  await iniciarPagoPedido(ds, p11.id);
  const r11 = await app.inject({ method: 'POST', url: '/pub/pagos/bancard/aviso', payload: { operation: pagarEnBancard(p11.id * 100 + 1) } });
  ok(r11.statusCode === 200 && JSON.parse(r11.body).status === 'success' && (await leer(p11.id)).estadoPago === EstadoPagoOnline.PAGADO,
    'POST /pub/pagos/bancard/aviso confirma el pago', r11.body);
  const r12 = await app.inject({ method: 'POST', url: '/pub/pagos/bancard/aviso', payload: { operation: { ...confirmacion(p11.id * 100 + 1), token: 'falso' } } });
  ok(r12.statusCode === 400, 'con firma falsa responde 400', r12.statusCode);
  const r13 = await app.inject({ method: 'POST', url: '/pub/pagos/../aviso', payload: {} });
  ok(r13.statusCode === 404, 'proveedor inválido en la ruta → 404', r13.statusCode);
  const r14: any = await invokeHandler('pub-pago-aviso', 'BANCARD', { operation: { shop_process_id: 'x' } });
  ok(r14?.http === 400, 'aviso sin proceso → 400', r14);
  await app.close();

  await ds.destroy();
  console.log(`\n[pagos-bancard] ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
