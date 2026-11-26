/**
 * «Guardar mi tarjeta» y pago con un toque con dinelco (PLAN-tienda-tarjeta-guardada) contra un
 * dinelco SIMULADO con el contrato de su documentación (catastro embebido y `/v3/payment`). Sin red.
 *
 * Uso: npm run test:tienda-tarjeta-guardada   ·   TIENDA_PG=<base vacía> … (Postgres)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import Fastify from 'fastify';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { PedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.entity';
import { CuentaCliente } from '../src/app/database/entities/pedidos-online/cuenta-cliente.entity';
import { TarjetaGuardada } from '../src/app/database/entities/pedidos-online/tarjeta-guardada.entity';
import { TiendaOnlineConfig } from '../src/app/database/entities/pedidos-online/tienda-online-config.entity';
import { EstadoPagoOnline, EstadoPedidoOnline, TipoPedidoOnline } from '../src/app/database/entities/pedidos-online/pedido-online.enums';
import {
  iniciarPagoPedido, verificarPagoPedido, setPagosOnlineDeps, pagarConTarjetaGuardada, registrarDecisionPago,
} from '../electron/services/pagos-online/pagos-online.service';
import { abrirCatastro, avisoCatastro, confirmarCatastro, listarTarjetas, quitarTarjeta } from '../electron/services/pagos-online/tarjetas-guardadas.service';
import { interpretarCatastroDinelco } from '../electron/services/pagos-online/proveedores/dinelco.proveedor';

let pass = 0, fail = 0;
function ok(c: boolean, msg: string, extra?: any) {
  if (c) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const KEY = 'di_sk_' + 'a'.repeat(48) + '_1234abcd';
const HOST = 'test-checkout.dinelco.com.py';

// ── dinelco simulado ──
interface Registro { sessionId: number; ref: string; body: any; resultado?: 'SUCCESSFUL' | 'FAILED'; tokenId?: string }
interface CobroT { ref: string; body: any; resp: any }
const registros = new Map<number, Registro>();
const cobros = new Map<string, CobroT>();
const llamadas: Array<{ metodo: string; ruta: string; body: any }> = [];
let sid = 30000, op = 770000000000, tk = 0;
/** Cómo responde el próximo cobro con token. */
let modoCobro: 'APROBAR' | 'RECHAZAR' | 'RED' | 'SIN_PERMISO' = 'APROBAR';
/** La consulta de una sesión de catastro trae el resultado (si no, solo el callback lo dice). */
let consultaTraeCatastro = true;
let reversaOk = true;
const fakeFetch = async (url: string, init: any = {}) => {
  const res = (status: number, b: any) => ({ status, text: async () => (b == null ? '' : JSON.stringify(b)) });
  const u = new URL(url);
  if (u.host !== HOST) return res(404, {});
  const body = init.body ? JSON.parse(init.body) : null;
  const ruta = u.pathname.replace('/dinelco-checkout/api', '');
  llamadas.push({ metodo: init.method || 'GET', ruta: ruta + u.search, body });
  if (String(init.headers?.Authorization || '') !== `Bearer ${KEY}`) return res(401, { message: 'Invalid or expired API Key' });
  if (ruta === '/v1/checkout-session/registry' && init.method === 'POST') {
    if (body?.amount !== 0 || body.currency !== 'PYG' || !body.targetOrigin) return res(400, { message: ['amount/currency/targetOrigin'] });
    const r: Registro = { sessionId: ++sid, ref: body.clientReferenceId, body };
    registros.set(r.sessionId, r);
    return res(201, { integrityToken: `reg-${sid}-secreto`, expirationDate: new Date(Date.now() + 10 * 60_000).toISOString(), sessionId: r.sessionId });
  }
  if (ruta === '/v1/checkout-session' && init.method === 'POST') {
    // Sesión del formulario de pago (la del #372): solo para abrirla; nadie la paga en este test.
    return res(201, { integrityToken: `pay-${++sid}-secreto`, expirationDate: new Date(Date.now() + 10 * 60_000).toISOString(), sessionId: sid });
  }
  if (ruta === '/v1/checkout-session' && u.searchParams.get('clientReferenceId')) return res(404, { message: 'checkout session is not found' });
  const m = ruta.match(/^\/v1\/checkout-session\/(\d+)$/);
  if (m && init.method !== 'POST') {
    const r = registros.get(Number(m[1]));
    if (!r) return res(200, { sessionId: Number(m[1]), sessionStatus: 'REQUIRES_PAYMENT' });
    return res(200, {
      sessionId: r.sessionId, clientReferenceId: r.ref, sessionStatus: r.resultado === 'SUCCESSFUL' ? 'SUCCESS' : r.resultado ? 'FAILED' : 'REQUIRES_PAYMENT',
      ...(consultaTraeCatastro && r.resultado ? { registryInfo: infoCatastro(r) } : {}),
    });
  }
  if (ruta === '/v3/payment' && init.method === 'POST') {
    if (modoCobro === 'SIN_PERMISO') return res(403, { message: 'Forbidden', errorCode: 'FORBIDDEN' });
    if (!body?.paymentOptions || !body?.paymentMethod?.tokenId) return res(400, { message: ['paymentOptions'] });
    const n = String(++op);
    const aprobado = modoCobro !== 'RECHAZAR';
    const resp = {
      id: op, clientReferenceId: body.clientReferenceId, message: aprobado ? 'Pago realizado con éxito' : 'Rechazado',
      operationNumber: n, authorizationCode: aprobado ? n.slice(-6) : '', responseCode: aprobado ? '00' : '51',
      paymentMethod: { type: 'CARD', tokenId: body.paymentMethod.tokenId, cardNumber: '540692******1096', cardBrand: 'MST', cardType: 'CREDIT' },
      status: aprobado ? 'APPROVED' : 'REJECTED', amount: body.amount, currency: 'PYG', merchant: 'Bepsa Prueba', transactionDate: new Date().toISOString(),
    };
    cobros.set(body.clientReferenceId, { ref: body.clientReferenceId, body, resp });
    if (modoCobro === 'RED') throw new Error('timeout'); // cobró, pero no llegó la respuesta
    return res(200, resp);
  }
  const g = ruta.match(/^\/v3\/payment\/(.+)$/);
  if (g && init.method !== 'POST') {
    if (modoCobro === 'SIN_PERMISO') return res(403, { message: 'Forbidden', errorCode: 'FORBIDDEN' });
    const c = cobros.get(decodeURIComponent(g[1]));
    return c ? res(200, c.resp) : res(404, { message: 'payment not found' });
  }
  if (ruta === '/v1/payment/reversal' && init.method === 'POST') {
    const c = [...cobros.values()].find((x) => x.resp.operationNumber === body?.operationNumber && x.resp.status === 'APPROVED');
    if (!c || !reversaOk) return res(400, { message: 'El pago no fue encontrado o ya ha sido revertido' });
    c.resp = { ...c.resp, status: 'VOIDED' };
    return res(200, { reversal: { id: 'R9', status: 'APPROVED' }, operationNumber: c.resp.operationNumber });
  }
  return res(404, { message: 'ruta' });
};
function infoCatastro(r: Registro) {
  return r.resultado === 'SUCCESSFUL'
    ? { status: 'SUCCESSFUL', paymentMethodInfo: { paymentMethodType: 'CARD', tokenId: r.tokenId, token: 'tok-largo-secreto', paymentMethodPayload: { cardBrand: 'MST', cardNumber: '540692******1096', cardType: 'C' } } }
    : { status: 'FAILED', paymentMethodInfo: { paymentMethodType: 'CARD', paymentMethodPayload: { cardBrand: 'VSA', cardNumber: '4456530000001005' } } };
}
const callbackCatastro = (r: Registro) => ({ message: r.resultado === 'SUCCESSFUL' ? 'Catastro exitoso' : 'El emisor no levantó el desafío', clientReferenceId: r.ref, registryInfo: infoCatastro(r), merchantCustomer: {} });
const catastrar = (ref: string, resultado: 'SUCCESSFUL' | 'FAILED' = 'SUCCESSFUL') => {
  const r = [...registros.values()].find((x) => x.ref === ref)!;
  r.resultado = resultado;
  if (resultado === 'SUCCESSFUL') r.tokenId = `TK${++tk}abcdefghij`;
  return r;
};

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-tienda-tarjeta-guardada.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log(`[tarjeta-guardada] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  setPagosOnlineDeps({ fetch: fakeFetch as any, apiKey: async () => '', avisar: async () => undefined, secretos: { 'DINELCO.apiKey': async () => KEY } });
  const cfgRepo = ds.getRepository(TiendaOnlineConfig);
  let cfg = await cfgRepo.findOne({ where: {}, order: { id: 'ASC' } });
  if (!cfg) cfg = await cfgRepo.save(cfgRepo.create({ activa: true } as any) as any) as TiendaOnlineConfig;
  const conDinelco = (dn: Record<string, string> = {}, extra: any = {}) => cfgRepo.update({ id: cfg!.id }, {
    pagoOnlineActivo: true, pagoProveedor: 'DINELCO', aceptacionAutomatica: false, pagoDevolucionAutomatica: false, ...extra,
    pagoConfigJson: JSON.stringify({ DINELCO: { entorno: 'PRUEBA', tarjetaGuardada: 'SI', topeTarjetaGuardada: '300000', maxDiaTarjetaGuardada: '3', ...dn } }),
  } as any);

  const ctas = ds.getRepository(CuentaCliente);
  const cuenta = async (email: string, verificado = true) => ctas.save(ctas.create({ email, telefono: '+595981000' + Math.floor(Math.random() * 1000), telefonoVerificado: verificado, activo: true } as any) as any) as Promise<CuentaCliente>;
  const ana = await cuenta('ana@x.com');
  const beto = await cuenta('beto@x.com');
  const sinTel = await cuenta('sintel@x.com', false);

  const repo = ds.getRepository(PedidoOnline);
  let seq = 0;
  const nuevo = async (c: CuentaCliente, total = 112000, extra: any = {}) => repo.save(repo.create({
    numero: `TG-${String(++seq).padStart(5, '0')}`, tipoPedido: TipoPedidoOnline.PICKUP, estado: EstadoPedidoOnline.PENDIENTE_PAGO, pagoModalidad: 'ONLINE',
    metodoPago: 'DINELCO', subtotal: total, costoEnvio: 0, total, items: [], cuentaCliente: { id: c.id }, ...extra,
  } as any) as any) as Promise<PedidoOnline>;
  const leer = (id: number) => repo.findOne({ where: { id } }) as Promise<PedidoOnline>;
  const tarjetas = ds.getRepository(TarjetaGuardada);

  console.log('Funciones puras');
  ok(interpretarCatastroDinelco({ clientReferenceId: 'FRCR-1-aaaaaa', registryInfo: { status: 'SUCCESSFUL', paymentMethodInfo: { tokenId: 'T1', paymentMethodPayload: { cardBrand: 'VSA', cardNumber: '4456******1005', cardType: 'C' } } } }, 'FRCR-1-aaaaaa').tipo === 'ACTIVA', 'SUCCESSFUL con tokenId → ACTIVA');
  ok(interpretarCatastroDinelco({ clientReferenceId: 'FRCR-1-aaaaaa', registryInfo: { status: 'SUCCESSFUL', paymentMethodInfo: {} } }, 'FRCR-1-aaaaaa').tipo === 'FALLIDA', 'SUCCESSFUL sin tokenId → FALLIDA');
  ok(interpretarCatastroDinelco({ clientReferenceId: 'FRCR-1-aaaaaa', registryInfo: { status: 'FAILED' } }, 'FRCR-1-aaaaaa').tipo === 'FALLIDA', 'FAILED → FALLIDA');
  ok(interpretarCatastroDinelco({ clientReferenceId: 'FRCR-9-bbbbbb', registryInfo: { status: 'SUCCESSFUL', paymentMethodInfo: { tokenId: 'T1' } } }, 'FRCR-1-aaaaaa').tipo === 'PENDIENTE', 'otra referencia → no decide');
  ok(interpretarCatastroDinelco({ sessionStatus: 'OPEN' }, 'FRCR-1-aaaaaa').tipo === 'PENDIENTE', 'sesión sin resultado → PENDIENTE');

  console.log('Interruptor y requisitos');
  await conDinelco({ tarjetaGuardada: 'NO' });
  ok(!(await listarTarjetas(ds, ana.id)).disponible, 'apagado → la tienda no lo ofrece');
  ok((await abrirCatastro(ds, ana.id, { consentimiento: true }) as any).error === 'tarjeta_no_disponible', 'apagado → no abre el catastro');
  await conDinelco();
  const l0 = await listarTarjetas(ds, ana.id);
  ok(l0.disponible && l0.tope === 300000 && l0.tarjetas.length === 0, 'prendido → disponible, con el tope', l0);
  ok((await abrirCatastro(ds, ana.id, {}) as any).error === 'tarjeta_sin_consentimiento', 'sin la casilla marcada → no abre');
  ok((await abrirCatastro(ds, sinTel.id, { consentimiento: true }) as any).error === 'telefono_no_verificado', 'sin teléfono verificado → no abre');

  console.log('Catastro');
  const a1: any = await abrirCatastro(ds, ana.id, { consentimiento: true });
  const reg1 = [...registros.values()].pop()!;
  ok(a1.success && /^FRCR-\d+-[0-9a-f]{12}$/.test(a1.ref) && a1.validarUrl === `https://${HOST}/d/api/registry/validate`, 'abre la sesión de catastro', a1);
  ok(reg1.body.amount === 0 && reg1.body.currency === 'PYG' && reg1.body.targetOrigin === 'https://app.frc-gourmet.com' && !reg1.body.customer, 'monto 0, PYG, origen y sin datos del cliente', reg1.body);
  ok(reg1.body.callbackUrl === 'https://app.frc-gourmet.com/pub/pagos/dinelco/aviso', 'callback a la URL de aviso', reg1.body.callbackUrl);
  const f1 = await tarjetas.findOne({ where: { registroRef: a1.ref } });
  ok(f1?.estado === 'PENDIENTE' && !!f1?.consentimientoEn, 'queda PENDIENTE con la fecha del consentimiento', f1);
  let c1: any = await confirmarCatastro(ds, ana.id, a1.ref);
  ok(c1.success && c1.estado === 'PENDIENTE', 'confirmar antes de que dinelco termine → sigue PENDIENTE', c1);
  ok((await confirmarCatastro(ds, beto.id, a1.ref)).error === 'tarjeta_no_encontrada', 'otra cuenta no puede confirmar el catastro ajeno');
  catastrar(a1.ref);
  c1 = await confirmarCatastro(ds, ana.id, a1.ref);
  ok(c1.estado === 'ACTIVA' && c1.tarjeta?.marca === 'MST' && c1.tarjeta?.enmascarada === '540692******1096', 'con la consulta → ACTIVA con marca y últimos dígitos', c1);
  const fila1 = await tarjetas.createQueryBuilder('t').addSelect('t.tokenId').where('t.id = :id', { id: c1.tarjeta.id }).getOne();
  ok(fila1?.tokenId === reg1.tokenId, 'guarda el tokenId');
  ok(!JSON.stringify(await ds.query(`SELECT * FROM tienda_tarjetas_guardadas`)).includes('tok-largo-secreto'), 'el token largo no se guarda');
  ok(!JSON.stringify(c1).includes(reg1.tokenId!), 'el tokenId no vuelve al storefront');
  const lAna = await listarTarjetas(ds, ana.id);
  ok(lAna.tarjetas.length === 1 && (await listarTarjetas(ds, beto.id)).tarjetas.length === 0, 'cada cliente ve solo sus tarjetas');

  // Catastro por callback (la consulta no trae el resultado), con la ruta pública.
  consultaTraeCatastro = false;
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, () => null);
  const { registerPublicRoutes } = require('../electron/server/public-routes');
  const app = Fastify();
  registerPublicRoutes(app, ds);
  await app.ready();
  const a2: any = await abrirCatastro(ds, beto.id, { consentimiento: true });
  const reg2 = [...registros.values()].find((x) => x.ref === a2.ref)!;
  const QA = { 'cf-connecting-ip': '190.128.216.70' };
  const tok = async (ref: string) => (await tarjetas.createQueryBuilder('t').addSelect('t.tokenId').where('t.registroRef = :r', { r: ref }).getOne())?.tokenId;
  const falso = { message: 'Catastro exitoso', clientReferenceId: a2.ref, merchantCustomer: {}, registryInfo: { status: 'SUCCESSFUL', paymentMethodInfo: { paymentMethodType: 'CARD', tokenId: 'tk-inyectado', paymentMethodPayload: { cardBrand: 'VSA', cardNumber: '411111******1111', cardType: 'C' } } } };
  // Control 3: con la IP de dinelco pero la sesión sin terminar en dinelco → no vale.
  const wa = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', headers: QA, payload: falso });
  ok(wa.statusCode === 200 && (await confirmarCatastro(ds, beto.id, a2.ref)).estado === 'PENDIENTE' && !(await tok(a2.ref)), 'callback de una sesión que dinelco no dio por terminada → sigue PENDIENTE', wa.body);
  catastrar(a2.ref);
  ok((await confirmarCatastro(ds, beto.id, a2.ref)).estado === 'PENDIENTE', 'la consulta no trae el token → espera el callback');
  const w0 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco-77/aviso', headers: QA, payload: callbackCatastro(reg2) });
  ok(w0.statusCode === 400 && (await confirmarCatastro(ds, beto.id, a2.ref)).estado === 'PENDIENTE', 'callback por la ruta de otra cuenta → no vale', w0.body);
  // Control 1: la IP.
  const w1 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', payload: callbackCatastro(reg2) });
  ok(w1.statusCode === 403 && (await confirmarCatastro(ds, beto.id, a2.ref)).estado === 'PENDIENTE', 'callback desde una IP que no es de dinelco → 403, sigue PENDIENTE', w1.body);
  const wp = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', headers: { 'cf-connecting-ip': '190.128.216.67' }, payload: callbackCatastro(reg2) });
  ok(wp.statusCode === 403, 'IP de dinelco de producción con una cuenta de PRUEBA → 403', wp.body);
  // Los tres controles: ACTIVA con el token del aviso.
  const w1b = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', headers: QA, payload: callbackCatastro(reg2) });
  const c2: any = await confirmarCatastro(ds, beto.id, a2.ref);
  ok(w1b.statusCode === 200 && c2.estado === 'ACTIVA' && (await tok(a2.ref)) === reg2.tokenId && c2.tarjeta?.enmascarada === '540692******1096', 'IP de dinelco + catastro pendiente + sesión SUCCESS → ACTIVA con el token del aviso', { c2 });
  const w2 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', headers: QA, payload: callbackCatastro(reg2) });
  ok(w2.statusCode === 400, 'callback repetido (ya no está PENDIENTE) → 400');
  // Si la consulta ya trae el resultado, manda la consulta (el cuerpo del aviso no se usa).
  consultaTraeCatastro = true;
  const a2b: any = await abrirCatastro(ds, beto.id, { consentimiento: true });
  const reg2b = catastrar(a2b.ref);
  const w3 = await app.inject({ method: 'POST', url: '/pub/pagos/dinelco/aviso', headers: QA, payload: { ...falso, clientReferenceId: a2b.ref } });
  ok(w3.statusCode === 200 && (await tok(a2b.ref)) === reg2b.tokenId, 'consulta con el resultado → manda la consulta, no el aviso', w3.body);
  await app.close();
  consultaTraeCatastro = true;

  // Catastro sin fricción → FALLIDA, con el mensaje.
  const a3: any = await abrirCatastro(ds, ana.id, { consentimiento: true });
  catastrar(a3.ref, 'FAILED');
  const c3: any = await confirmarCatastro(ds, ana.id, a3.ref);
  ok(c3.estado === 'FALLIDA' && (await listarTarjetas(ds, ana.id)).tarjetas.length === 1, 'catastro fallido → FALLIDA y no suma tarjeta', c3);
  // Callback vencido (más de 30 min).
  const a4: any = await abrirCatastro(ds, ana.id, { consentimiento: true });
  const reg4 = catastrar(a4.ref);
  const vencido = await avisoCatastro(ds, 'DINELCO', callbackCatastro(reg4), new Date(Date.now() + 31 * 60_000));
  ok(vencido.http === 400, 'callback de un catastro abierto hace más de 30 min → no vale');
  await tarjetas.update({ registroRef: a4.ref }, { estado: 'FALLIDA' } as any);
  ok((await abrirCatastro(ds, ana.id, { consentimiento: true }) as any).success, 'cuarto catastro de la hora → se abre');
  ok((await abrirCatastro(ds, ana.id, { consentimiento: true }) as any).success, 'quinto → se abre');
  ok((await abrirCatastro(ds, ana.id, { consentimiento: true }) as any).error === 'demasiados_intentos', 'sexto en una hora → demasiados_intentos');

  console.log('Pago con un toque');
  const tAna = lAna.tarjetas[0].id;
  const tBeto = c2.tarjeta.id;
  const p1 = await nuevo(ana, 112000);
  ok((await pagarConTarjetaGuardada(ds, p1.id, ana.id, tBeto)).error === 'tarjeta_no_encontrada', 'con la tarjeta de otro cliente → no');
  const antes = cobros.size;
  const r1: any = await pagarConTarjetaGuardada(ds, p1.id, ana.id, tAna);
  let q = await leer(p1.id);
  const cob1 = [...cobros.values()].pop()!;
  ok(r1.success && r1.recienPagado && q.estadoPago === EstadoPagoOnline.PAGADO && cobros.size === antes + 1, 'APPROVED → pedido PAGADO', { r1, q });
  ok(cob1.body.amount === 112000 && cob1.body.currency === 'PYG' && cob1.body.paymentMethod.tokenId === fila1!.tokenId && !!cob1.body.paymentOptions, 'cobra el total del pedido con el tokenId', cob1.body);
  ok(q.pagoId === cob1.resp.operationNumber && cob1.ref.startsWith(`FRCG-${p1.id * 100 + 1}-`), 'guarda la operación; referencia del intento', q.pagoId);
  ok((await tarjetas.findOne({ where: { id: tAna } }))?.ultimoUsoEn != null, 'marca el último uso');
  ok((await pagarConTarjetaGuardada(ds, p1.id, ana.id, tAna)).error === 'pedido_no_espera_pago' && cobros.size === antes + 1, 'otro toque sobre el pedido pagado → no cobra de nuevo');

  // Reversa del cobro con token (pedido cancelado en el PdV con «devolver»).
  await conDinelco({}, { pagoDevolucionAutomatica: true });
  await repo.update({ id: p1.id }, { estado: EstadoPedidoOnline.CANCELADO, estadoPago: EstadoPagoOnline.REEMBOLSO_PENDIENTE } as any);
  const dev: any = await registrarDecisionPago(ds, p1.id, { decision: 'DEVOLVER' as any, motivo: null }, 'CANCELADO_PDV', 1);
  const rev = llamadas.filter((l) => l.ruta === '/v1/payment/reversal').pop();
  ok(dev.devolucionAutomatica?.ok === true && cob1.resp.status === 'VOIDED' && (await leer(p1.id)).estadoPago === EstadoPagoOnline.DEVUELTO, 'cancelado con «devolver» → reversa del cobro con token y DEVUELTO', dev);
  ok(rev?.body?.operationNumber === cob1.resp.operationNumber && rev?.body?.clientReferenceId === cob1.ref, 'la reversa va con la operación y la referencia', rev?.body);
  await conDinelco();

  // Rechazo → FALLIDO y el cliente puede usar el formulario.
  modoCobro = 'RECHAZAR';
  const p2 = await nuevo(ana, 50000);
  const r2: any = await pagarConTarjetaGuardada(ds, p2.id, ana.id, tAna);
  q = await leer(p2.id);
  ok(r2.success && q.estadoPago === EstadoPagoOnline.FALLIDO, 'REJECTED → FALLIDO', { r2, q });
  modoCobro = 'APROBAR';
  const i2: any = await iniciarPagoPedido(ds, p2.id, { nuevoIntento: true });
  ok(i2.success && i2.tipo === 'IFRAME', 'tras el rechazo, el formulario abre un intento nuevo', i2);

  // Sin respuesta: queda PENDIENTE, no se cobra dos veces, el job consulta v3.
  modoCobro = 'RED';
  const p3 = await nuevo(ana, 60000);
  const n3 = cobros.size;
  const r3: any = await pagarConTarjetaGuardada(ds, p3.id, ana.id, tAna);
  q = await leer(p3.id);
  ok(r3.success && r3.pendiente && q.estadoPago === EstadoPagoOnline.PENDIENTE, 'sin respuesta → PENDIENTE', { r3, q });
  modoCobro = 'APROBAR';
  ok((await pagarConTarjetaGuardada(ds, p3.id, ana.id, tAna)).error === 'pago_en_curso' && cobros.size === n3 + 1, 'otro toque con uno PENDIENTE → no cobra');
  const i3: any = await iniciarPagoPedido(ds, p3.id);
  ok(!i3.success && i3.error === 'pago_en_curso', 'el formulario tampoco se abre si el cobro con token está aprobado', i3);
  const v3 = await verificarPagoPedido(ds, p3.id);
  ok(v3.recienPagado && (await leer(p3.id)).estadoPago === EstadoPagoOnline.PAGADO, 'la consulta de /v3/payment/{ref} confirma el pago', v3);
  ok(llamadas.some((l) => l.metodo === 'GET' && l.ruta.startsWith('/v3/payment/FRCG-')), 'consultó por referencia en v3');

  // Límites: tope, cantidad por día, dirección nueva.
  console.log('Límites');
  const pTope = await nuevo(ana, 300001);
  ok((await pagarConTarjetaGuardada(ds, pTope.id, ana.id, tAna)).error === 'tarjeta_tope', 'más que el tope → con el formulario');
  // Van 2 pedidos con un toque (p1 y p3; p2 se rechazó y pasó al formulario): el tercero entra.
  ok(!!(await pagarConTarjetaGuardada(ds, (await nuevo(ana, 1000)).id, ana.id, tAna) as any).recienPagado, 'tercero con un toque en 24 h → entra');
  ok((await pagarConTarjetaGuardada(ds, (await nuevo(ana, 1000)).id, ana.id, tAna)).error === 'tarjeta_limite_dia', 'cuarto con un toque en 24 h → con el formulario');
  await conDinelco({ maxDiaTarjetaGuardada: '20' });
  const pDel = await nuevo(ana, 40000, { tipoPedido: TipoPedidoOnline.DELIVERY, direccionEntrega: 'Mcal. López 1234', latitud: -25.29, longitud: -57.6 });
  ok((await pagarConTarjetaGuardada(ds, pDel.id, ana.id, tAna)).error === 'tarjeta_direccion_nueva', 'delivery a una dirección sin entregas → con el formulario');
  await nuevo(ana, 1, { tipoPedido: TipoPedidoOnline.DELIVERY, estado: EstadoPedidoOnline.ENTREGADO, direccionEntrega: 'Otra 1', latitud: -25.2901, longitud: -57.6001 });
  ok((await pagarConTarjetaGuardada(ds, pDel.id, ana.id, tAna) as any).recienPagado, 'delivery cerca (≤150 m) de una entrega anterior → con un toque');

  // Sin permiso payment:create → FALLIDO (no cobró), el cliente sigue con el formulario.
  modoCobro = 'SIN_PERMISO';
  const p5 = await nuevo(ana, 20000);
  await pagarConTarjetaGuardada(ds, p5.id, ana.id, tAna);
  ok((await leer(p5.id)).estadoPago === EstadoPagoOnline.FALLIDO, 'clave sin payment:create → FALLIDO, sin cobro');
  // «Probar conexión» avisa si la clave no tiene payment:create (solo con «guardar tarjetas»).
  const { dinelcoProveedor } = require('../electron/services/pagos-online/proveedores/dinelco.proveedor');
  const credsT = { apiKey: KEY, entorno: 'PRUEBA', tarjetaGuardada: true } as any;
  const pc1 = await dinelcoProveedor.probarConexion(credsT, { fetch: fakeFetch });
  ok(!pc1.ok && pc1.error === 'dinelco_sin_permiso_tarjeta', 'Probar conexión: sin payment:create → lo avisa', pc1);
  ok((await dinelcoProveedor.probarConexion({ ...credsT, tarjetaGuardada: false }, { fetch: fakeFetch })).ok, 'Probar conexión sin guardar tarjetas → no mira payment:create');
  modoCobro = 'APROBAR';
  ok((await dinelcoProveedor.probarConexion(credsT, { fetch: fakeFetch })).ok, 'Probar conexión con payment:create → ok');

  // Con un iframe abierto sin pagar: el toque usa el mismo intento y la sesión queda en previas.
  const p6 = await nuevo(beto, 30000);
  await iniciarPagoPedido(ds, p6.id);
  const r6: any = await pagarConTarjetaGuardada(ds, p6.id, beto.id, tBeto);
  const d6 = JSON.parse((await repo.createQueryBuilder('p').addSelect('p.pagoDatosJson').where('p.id = :id', { id: p6.id }).getOne())!.pagoDatosJson!);
  ok(r6.recienPagado && d6.modo === 'TOKEN' && d6.previas.length === 1 && !d6.previas[0].token, 'con el formulario abierto → paga con un toque y guarda la sesión del formulario', d6);

  // Interruptor apagado → no cobra con token.
  await conDinelco({ tarjetaGuardada: 'NO' });
  const p7 = await nuevo(ana, 10000);
  ok((await pagarConTarjetaGuardada(ds, p7.id, ana.id, tAna)).error === 'tarjeta_no_disponible', 'interruptor apagado → no cobra con tarjeta guardada');
  await conDinelco();

  console.log('Quitar');
  ok((await quitarTarjeta(ds, beto.id, tAna)).error === 'tarjeta_no_encontrada', 'no se quita la tarjeta de otro');
  ok((await quitarTarjeta(ds, ana.id, tAna)).success, 'quitar la propia');
  const fq = await tarjetas.createQueryBuilder('t').addSelect('t.tokenId').where('t.id = :id', { id: tAna }).getOne();
  ok(fq?.estado === 'QUITADA' && fq.tokenId == null && (await listarTarjetas(ds, ana.id)).tarjetas.length === 0, 'queda QUITADA, sin tokenId y no se lista', fq);
  ok((await pagarConTarjetaGuardada(ds, (await nuevo(ana, 1000)).id, ana.id, tAna)).error === 'tarjeta_no_encontrada', 'una tarjeta quitada no cobra');

  ok(llamadas.every((l) => !JSON.stringify(l.body ?? {}).includes(KEY)), 'la clave va solo en la cabecera');

  await ds.destroy();
  console.log(`\n[tarjeta-guardada] ${pass} ok, ${fail} fallas`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
