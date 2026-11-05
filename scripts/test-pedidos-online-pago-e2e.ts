/**
 * E2E del pago del pedido online (tienda F8): cómo dice el cliente que va a pagar.
 *
 *  [A] métodos: sin configurar sólo efectivo; los habilitados se aceptan, el resto no
 *  [B] efectivo en ₲: «paga con» tiene que superar el total
 *  [C] efectivo en US$ con la cotización cargada AL REVÉS (₲→US$): total ₲ 45.000 = US$ 7,50
 *  [D] monedas: sin cotización o inactiva no se ofrecen ni se aceptan; monedas.get
 *  [E] observación en MAYÚSCULAS y recortada; el total cobrado no cambia por la moneda
 *  [F] reintento idempotente con otro «paga con» devuelve el pedido original
 *  [G] resumen del pago (bandeja) y bloque del ticket de delivery
 *  [H] uPay: modalidad online, sin moneda ni vuelto (validación unitaria)
 *
 * Uso: npm run test:pedidos-online-pago   ·   npm run test:pedidos-online-pago-pg (Postgres temporal)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[pago-pg]' : '[pago]';
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-pedidos-online-pago.db');
    if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
    const ds = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
    await ds.initialize();
    return { ds, cerrar: async () => { await ds.destroy(); } };
  }
  const conn = {
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || undefined,
  };
  const nombre = `frc_gourmet_pagotest_${process.pid}`;
  const admin = new DataSource({ type: 'postgres', ...conn, database: 'postgres' } as any);
  try { await admin.initialize(); } catch (e: any) {
    console.log(`${TAG} SALTEADO: no hay Postgres disponible (${String(e.message).split('\n')[0]}).`);
    return null;
  }
  await admin.query(`CREATE DATABASE "${nombre}"`);
  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', ...conn, database: nombre } as any) as any), synchronize: false, migrationsRun: false });
  await ds.initialize();
  return { ds, cerrar: async () => { await ds.destroy(); await admin.query(`DROP DATABASE IF EXISTS "${nombre}"`); await admin.destroy(); } };
}

async function main() {
  const base = await abrirBase();
  if (!base) process.exit(0);
  const { ds, cerrar } = base!;
  await ds.runMigrations({ transaction: 'each' });
  console.log(`${TAG} Migraciones OK (${PG ? 'Postgres' : 'SQLite'}).`);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const save = (ent: any, data: any): Promise<any> => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { MonedaBillete } = E('financiero/moneda-billete.entity');
  const { TipoPrecio } = E('financiero/tipo-precio.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { PrecioVenta } = E('productos/precio-venta.entity');
  const { CuentaCliente } = E('pedidos-online/cuenta-cliente.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Delivery } = E('ventas/delivery.entity');

  const gs = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const usd = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'US$', principal: false, activo: true, decimales: 2 });
  const brl = await save(Moneda, { denominacion: 'REAL', simbolo: 'R$', principal: false, activo: true, decimales: 2 }); // sin cotización
  const eur = await save(Moneda, { denominacion: 'EURO', simbolo: 'EUR', principal: false, activo: false, decimales: 2 }); // inactiva
  // Cotización cargada AL REVÉS (origen ₲, destino US$): compraLocal = ₲ por 1 US$ igual.
  await save(MonedaCambio, { monedaOrigen: gs, monedaDestino: usd, compraOficial: 6000, ventaOficial: 6200, compraLocal: 6000, ventaLocal: 6200, activo: true });
  await save(MonedaCambio, { monedaOrigen: eur, monedaDestino: gs, compraOficial: 7000, ventaOficial: 7100, compraLocal: 7000, ventaLocal: 7100, activo: true });
  for (const v of [10000, 20000, 50000, 100000]) await save(MonedaBillete, { moneda: gs, valor: v, activo: true });
  for (const v of [5, 10, 20]) await save(MonedaBillete, { moneda: usd, valor: v, activo: true });

  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'CLASICAS', activo: true, familia: await save(Familia, { nombre: 'HAMBURGUESAS', activo: true }) });
  const producto = await save(Producto, { nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda: gs, tipoPrecio, presentacion });
  const cuenta = await save(CuentaCliente, { telefono: '0981111222', telefonoVerificado: true, nombre: 'CLIENTE PAGO', activo: true });

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const rol = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['PEDIDOS_ONLINE_CONFIGURAR', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'VENTAS_PDV']) {
    await save(RolePermission, { role: rol, permission: await save(Permission, { codigo, descripcion: codigo, activo: true }) });
  }
  await save(UsuarioRole, { usuario: admin, role: rol });

  const getUser = () => admin;
  require('../electron/handlers/pedidos-online.handler').registerPedidosOnlineHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-admin.handler').registerPedidosOnlineAdminHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-config.handler').registerPedidosOnlineConfigHandlers(ds, getUser);

  const pedir = (extra: any = {}): Promise<any> => invokeHandlerWithContext('crear-pedido-online', { customerId: cuenta.id } as any, {
    tipoPedido: 'PICKUP', items: [{ productoId: producto.id, presentacionId: presentacion.id, cantidad: 1 }], ...extra,
  });
  const leer = async (r: any) => ds.getRepository(PedidoOnline).findOne({ where: { numero: r?.numero } });

  // ═══════ [A] Métodos ═══════
  console.log('\n[A] Métodos habilitados');
  const cfg0: any = await invokeHandler('get-tienda-online-config-public');
  ok(JSON.stringify(cfg0?.metodosPago) === '["EFECTIVO"]', 'A: sin configurar, la tienda ofrece sólo efectivo', cfg0?.metodosPago);
  const qrNo = await pedir({ metodoPago: 'QR' });
  ok(qrNo?.success === false && qrNo?.error === 'metodo_pago_no_disponible', 'A: QR sin habilitar se rechaza', qrNo);
  await invokeHandler('update-tienda-online-config', { metodosPago: ['EFECTIVO', 'qr', 'TRANSFERENCIA', 'BASURA', 'CREDITO'] });
  const cfg1: any = await invokeHandler('get-tienda-online-config-public');
  ok(JSON.stringify(cfg1?.metodosPago) === '["EFECTIVO","QR","TRANSFERENCIA"]', 'A: se guardan sólo los conocidos (CREDITO todavía no existe)', cfg1?.metodosPago);
  const qr = await pedir({ metodoPago: 'QR', pagoMonedaId: usd.id, vueltoPara: 999 });
  const pqr: any = await leer(qr);
  ok(qr?.success === true && pqr.metodoPago === 'QR' && pqr.pagoModalidad === 'AL_RECIBIR' && pqr.pagoMonedaId == null && pqr.vueltoPara == null,
    'A: QR al recibir, sin moneda ni vuelto (se ignoran)', pqr && { m: pqr.metodoPago, mod: pqr.pagoModalidad, mon: pqr.pagoMonedaId, v: pqr.vueltoPara });
  const pixNo = await pedir({ metodoPago: 'PIX' });
  ok(pixNo?.error === 'metodo_pago_no_disponible', 'A: PIX no habilitado se rechaza');
  await invokeHandler('update-tienda-online-config', { metodosPago: [] });
  ok(JSON.stringify((await invokeHandler('get-tienda-online-config-public') as any)?.metodosPago) === '["EFECTIVO"]', 'A: lista vacía = sólo efectivo (nunca sin forma de pago)');
  await invokeHandler('update-tienda-online-config', { metodosPago: ['EFECTIVO', 'QR', 'TRANSFERENCIA'] });

  // ═══════ [B] Efectivo en ₲ ═══════
  console.log('\n[B] Efectivo en guaraníes');
  const sinVuelto = await pedir({ metodoPago: 'EFECTIVO' });
  const psv: any = await leer(sinVuelto);
  ok(sinVuelto?.success && psv.pagoMonedaId === gs.id && psv.vueltoPara == null && psv.pagoCotizacion == null, 'B: sin «paga con» → efectivo en ₲, sin vuelto', psv);
  for (const [v, nombre] of [[45000, 'igual al total'], [40000, 'menor al total']] as const) {
    const r = await pedir({ metodoPago: 'EFECTIVO', vueltoPara: v });
    ok(r?.error === 'vuelto_insuficiente', `B: «paga con» ${nombre} se rechaza`, r);
  }
  const con50 = await pedir({ metodoPago: 'EFECTIVO', vueltoPara: 50000 });
  ok(Number((await leer(con50) as any)?.vueltoPara) === 50000, 'B: paga con ₲ 50.000 se guarda');
  ok((await pedir({ metodoPago: 'EFECTIVO', vueltoPara: 'abc' }))?.error === 'vuelto_invalido', 'B: «paga con» no numérico se rechaza');

  // ═══════ [C] Efectivo en US$ ═══════
  console.log('\n[C] Efectivo en dólares (cotización cargada al revés)');
  const exacto = await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: usd.id, vueltoPara: 7.5 });
  ok(exacto?.error === 'vuelto_insuficiente', 'C: US$ 7,50 = el total exacto (₲ 45.000 / 6.000) no necesita vuelto → se rechaza', exacto);
  const casi = await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: usd.id, vueltoPara: 7.49 });
  ok(casi?.error === 'vuelto_insuficiente', 'C: US$ 7,49 no alcanza');
  const usd10 = await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: usd.id, vueltoPara: 10 });
  const pu: any = await leer(usd10);
  ok(usd10?.success && pu.pagoMonedaId === usd.id && Number(pu.vueltoPara) === 10 && Number(pu.pagoCotizacion) === 6000,
    'C: paga con US$ 10: se guarda la moneda y la cotización usada (6.000)', pu && [pu.pagoMonedaId, pu.vueltoPara, pu.pagoCotizacion]);
  const usdSin = await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: usd.id });
  ok(usdSin?.success && Number((await leer(usdSin) as any).pagoCotizacion) === 6000, 'C: en US$ sin vuelto también guarda la cotización');

  // ═══════ [D] Monedas ═══════
  console.log('\n[D] Monedas');
  ok((await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: brl.id }))?.error === 'moneda_no_disponible', 'D: R$ sin cotización se rechaza');
  ok((await pedir({ metodoPago: 'EFECTIVO', pagoMonedaId: eur.id }))?.error === 'moneda_no_disponible', 'D: una moneda inactiva se rechaza');
  const monedas: any[] = await invokeHandler('get-monedas-tienda') as any;
  ok(monedas.map((m) => m.simbolo).join() === 'Gs,US$', 'D: monedas.get: la principal primero y sólo las que tienen cotización activa', monedas.map((m) => m.simbolo));
  const mu = monedas.find((m) => m.simbolo === 'US$');
  ok(mu?.cotizacion === 6000 && mu?.decimales === 2 && JSON.stringify(mu?.billetes) === '[5,10,20]', 'D: US$ con cotización, decimales y billetes (como números)', mu);
  ok(Object.keys(mu).sort().join() === 'billetes,cotizacion,decimales,denominacion,id,principal,simbolo', 'D: monedas.get no publica nada más', Object.keys(mu));

  // ═══════ [E] Observación y total ═══════
  console.log('\n[E] Observación y total');
  const obs = await pedir({ metodoPago: 'EFECTIVO', pagoObservacion: '  tengo billete de 100 ' + 'x'.repeat(300) });
  const po: any = await leer(obs);
  ok(po.pagoObservacion.startsWith('TENGO BILLETE DE 100') && po.pagoObservacion.length === 200, 'E: observación en MAYÚSCULAS, sin espacios de borde y hasta 200', po.pagoObservacion.length);
  ok(Number(pu.total) === 45000 && Number(psv.total) === 45000, 'E: el total del pedido es el mismo en ₲ pague como pague');

  // ═══════ [F] Idempotencia ═══════
  console.log('\n[F] Reintento');
  const key = 'b1b2c3d4-0000-4000-8000-0000000000f8';
  const r1 = await pedir({ metodoPago: 'EFECTIVO', vueltoPara: 50000, idempotencyKey: key });
  const r2 = await pedir({ metodoPago: 'EFECTIVO', vueltoPara: 100000, idempotencyKey: key });
  ok(r2?.numero === r1?.numero && Number((await leer(r1) as any).vueltoPara) === 50000, 'F: el reintento con otro «paga con» devuelve el pedido original', [r1?.numero, r2]);

  // ═══════ [G] Resumen y ticket ═══════
  console.log('\n[G] Lo que ve el local');
  const lista: any[] = await invokeHandler('get-pedidos-online-admin', {}) as any;
  const res = (n: string) => lista.find((p) => p.numero === n)?.pagoResumen;
  ok(res(usd10.numero) === 'EFECTIVO · EN US$ · PAGA CON US$ 10,00 (≈ Gs 60.000) · VUELTO Gs 15.000', 'G: bandeja, efectivo en dólares con vuelto en guaraníes', res(usd10.numero));
  ok(res(con50.numero) === 'EFECTIVO · PAGA CON Gs 50.000 · VUELTO Gs 5.000', 'G: bandeja, efectivo en guaraníes', res(con50.numero));
  ok(res(sinVuelto.numero) === 'EFECTIVO · SIN VUELTO', 'G: bandeja, sin vuelto', res(sinVuelto.numero));
  ok(res(qr.numero) === 'QR · AL RECIBIR', 'G: bandeja, QR al recibir', res(qr.numero));
  const viejo = await save(PedidoOnline, { numero: 'PO-VIEJO', tipoPedido: 'PICKUP', canalOrigen: 'WEB', metodoPago: 'EFECTIVO', estado: 'RECIBIDO', subtotal: 1000, costoEnvio: 0, total: 1000 });
  const lista2: any[] = await invokeHandler('get-pedidos-online-admin', {}) as any;
  ok(lista2.find((p) => p.numero === 'PO-VIEJO')?.pagoResumen === 'EFECTIVO', 'G: un pedido anterior a F8 (columnas en null) muestra sólo el método, sin inventar «sin vuelto»', lista2.find((p) => p.numero === 'PO-VIEJO')?.pagoResumen);

  const { buildDeliveryTicketLines } = require('../electron/handlers/documentos-tickets.handler');
  const texto = (b: any) => (b?.lines || []).filter((l: any) => l.type === 'text').map((l: any) => l.text).join('\n');
  const dWeb = await save(Delivery, { estado: 'ABIERTO', modo: 'DELIVERY', fechaAbierto: new Date(), direccion: 'CALLE 1' });
  await ds.getRepository(PedidoOnline).update({ id: pu.id }, { deliveryId: dWeb.id } as any);
  const dPdv = await save(Delivery, { estado: 'ABIERTO', modo: 'DELIVERY', fechaAbierto: new Date(), direccion: 'CALLE 2' });
  let tWeb = '', tPdv = '';
  try { tWeb = texto(await buildDeliveryTicketLines(ds, dWeb.id, { width: 32 })); } catch (e: any) { tWeb = 'ERROR ' + e.message; }
  try { tPdv = texto(await buildDeliveryTicketLines(ds, dPdv.id, { width: 32 })); } catch (e: any) { tPdv = 'ERROR ' + e.message; }
  ok(/PAGO:/.test(tWeb) && /PAGA CON US\$ 10,00/.test(tWeb) && /VUELTO Gs 15\.000/.test(tWeb), 'G: el ticket del delivery web dice con cuánto paga y el vuelto a llevar', tWeb.slice(0, 400));
  ok(!/PAGO:/.test(tPdv) && !/ERROR/.test(tPdv), 'G: un delivery cargado en el PdV (sin pedido web) sale como siempre', tPdv.slice(0, 200));
  ok(viejo.id > 0, 'G: (fixture) pedido viejo creado');

  // ═══════ [H] uPay ═══════
  console.log('\n[H] uPay');
  const { validarPagoPedido, totalEnMoneda } = require('../electron/utils/pago-pedido.utils');
  const up = validarPagoPedido({ data: { pagoMonedaId: usd.id, vueltoPara: 50 }, total: 45000, metodoPago: 'UPAY', habilitados: ['EFECTIVO'], monedas: [] });
  ok(up.ok && up.campos.pagoModalidad === 'ONLINE' && up.campos.pagoMonedaId === null && up.campos.vueltoPara === null, 'H: uPay es online y descarta moneda y vuelto', up);
  ok(totalEnMoneda(45000, 6000, 2) === 7.5 && totalEnMoneda(45001, 6000, 2) === 7.51 && totalEnMoneda(45000, 1, 0) === 45000,
    'H: el total en otra moneda se redondea hacia arriba a sus decimales');

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
