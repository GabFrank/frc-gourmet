/**
 * E2E de flujo completo de la atención de pedidos web (F10), con los handlers REALES y la
 * materialización real (venta + delivery/retiro + comanda), no filas armadas a mano.
 *
 * Lo que se mira en cada flujo son los TRES registros juntos —pedido, venta y delivery— porque el
 * bug que motivó esto (PO-000006, 2026-11-06) fue exactamente un desfase entre ellos: el pedido
 * quedó CANCELADO con su retiro vivo, y el cajero lo cobró y entregó.
 *
 *  [1] el cliente pide cancelar un retiro en preparación → el local aprueba → pedido, venta y
 *      retiro cancelados; la lista de delivery lo muestra cancelado; no se puede cobrar ni entregar
 *  [2] el local dice «no se puede» → el pedido sigue; el retiro avanza, se cobra, se entrega y el
 *      pedido queda ENTREGADO (sincronizado desde el delivery)
 *  [3] pagado online, cancelado desde el diálogo de delivery → a devolver; cola DEVOLVER; «ya
 *      devolví» lo saca
 *  [4] aceptado sin venta → cola SIN_COCINA → enviar a cocina con la caja → sale de la cola y
 *      aparece en la lista de delivery con su número PO
 *  [5] el local rechaza un pedido ya materializado (bandeja) → venta y retiro cancelados
 *  [6] solicitud sin responder y el pedido se entrega → la solicitud se cierra sola
 *  [7] la venta del pedido se cancela desde el PdV → el pedido y el retiro no quedan vivos; esa
 *      venta no se rehabilita; una venta común sí
 *  [8] avanzar desde la bandeja mueve pedido y retiro, y no revive un pedido rechazado
 *
 * Uso: npm run test:pedidos-online-atencion-flujo   ·   … -- --pg (Postgres temporal)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, installHandlerRegistry } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[atencion-flujo-pg]' : '[atencion-flujo]';
let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function lanza(fn: () => Promise<any>): Promise<string> {
  try { await fn(); return ''; } catch (e: any) { return String(e?.message || e); }
}

async function abrirBase(): Promise<{ ds: DataSource; cerrar: () => Promise<void> } | null> {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  if (!PG) {
    const dbFile = path.join(tmpDir, 'test-pedidos-online-atencion-flujo.db');
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
  const nombre = `frc_gourmet_atenciontest_${process.pid}`;
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
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any): Promise<any> => R(e).save(R(e).create(data));
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { TipoPrecio } = E('financiero/tipo-precio.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { PrecioVenta } = E('productos/precio-venta.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Venta } = E('ventas/venta.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { PedidoOnlineItem } = E('pedidos-online/pedido-online-item.entity');
  const { Pago } = E('compras/pago.entity');

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'VENTAS_DELIVERY_CANCELAR_COBRADO']) {
    await save(RolePermission, { role, permission: await save(Permission, { codigo, descripcion: codigo, activo: true }) });
  }
  await save(UsuarioRole, { usuario: admin, role });
  const moneda = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const caja = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), dispositivo: await save(Dispositivo, { nombre: 'CAJA1', activo: true }),
    conteoApertura: await save(Conteo, {}), activo: true,
  });
  await save(PdvConfig, { autoImprimirComanda: false });
  const subfamilia = await save(Subfamilia, { nombre: 'GENERAL', activo: true, familia: await save(Familia, { nombre: 'GENERAL', activo: true }) });
  const producto = await save(Producto, {
    nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia,
  });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda, tipoPrecio, presentacion });

  installHandlerRegistry();
  const getUser = () => admin;
  const { registerVentasHandlers, materializarPedidoOnlineEnVenta } = require('../electron/handlers/ventas.handler');
  registerVentasHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-admin.handler').registerPedidosOnlineAdminHandlers(ds, getUser);
  require('../electron/handlers/delivery.handler').registerDeliveryHandlers(ds, getUser);

  let seq = 0;
  const nuevoPedido = async (extra: any = {}) => {
    seq++;
    const p = await save(PedidoOnline, {
      numero: `PO-F${String(seq).padStart(5, '0')}`, tipoPedido: 'PICKUP', estado: 'ACEPTADO', canalOrigen: 'WEB',
      metodoPago: 'EFECTIVO', subtotal: 45000, costoEnvio: 0, total: 45000, nombreCliente: 'CLIENTE PRUEBA', ...extra,
    });
    await save(PedidoOnlineItem, {
      pedido: { id: p.id }, productoId: producto.id, presentacionId: presentacion.id,
      nombreProducto: 'HAMBURGUESA', cantidad: 1, precioUnitario: 45000, subtotal: 45000, personalizacion: JSON.stringify({}),
    });
    return p;
  };
  /** Pedido aceptado y materializado: venta + retiro + comanda, como al tocar ACEPTAR. */
  const materializado = async (extra: any = {}) => {
    const p = await nuevoPedido(extra);
    const mat = await materializarPedidoOnlineEnVenta(ds, p.id, { cajaId: caja.id }, admin.id);
    return { id: p.id, numero: p.numero, ventaId: mat.ventaId };
  };
  const estado = async (pedidoId: number) => {
    const p: any = await R(PedidoOnline).findOne({ where: { id: pedidoId } });
    const v: any = p?.ventaId ? await R(Venta).findOne({ where: { id: p.ventaId } }) : null;
    const d: any = p?.deliveryId ? await R(Delivery).findOne({ where: { id: p.deliveryId } }) : null;
    return { p, v, d, resumen: `${p?.estado}/${v?.estado ?? '-'}/${d?.estado ?? '-'}` };
  };
  const pedirCancelar = (pedidoId: number, motivo: string) => R(PedidoOnline).update({ id: pedidoId }, {
    cancelacionSolicitadaEn: new Date(), cancelacionMotivo: motivo.toUpperCase(),
  } as any);
  const cola = async () => ((await invokeHandler('get-pedidos-online-admin', { atencion: true })) as any[]) || [];
  const enCola = async (numero: string) => (await cola()).find((p) => p.numero === numero)?.motivoAtencion ?? null;
  const filaDelivery = async (deliveryId: number) =>
    ((await invokeHandler('delivery-listar-pdv', caja.id, { page: 1, pageSize: 100 })) as any)?.data?.find((d: any) => d.id === deliveryId);
  const cobrar = async (ventaId: number) => {
    const pago = await save(Pago, { estado: 'PAGADO' } as any);
    await invokeHandler('updateVenta', ventaId, { pago: { id: pago.id } });
    return invokeHandler('updateVenta', ventaId, { estado: 'CONCLUIDA', __validarDispositivoCaja: true });
  };

  // ═══════ [1] Cancelación pedida y aprobada ═══════
  console.log('\n[1] El cliente pide cancelar y el local aprueba');
  const a = await materializado();
  let s = await estado(a.id);
  ok(s.resumen === 'EN_PREPARACION/ABIERTA/ABIERTO' && s.d?.modo === 'RETIRO', '1: materializado: en preparación, venta abierta, retiro abierto', s.resumen);
  await pedirCancelar(a.id, 'me equivoqué de local');
  ok(await enCola(a.numero) === 'CANCELACION', '1: entra a la cola como CANCELACION');
  ok((await filaDelivery(s.d.id))?.pedidoWeb?.pideCancelar === true, '1: la fila de delivery muestra la cancelación pedida');
  const apA: any = await invokeHandler('resolver-cancelacion-pedido-online', a.id, true);
  s = await estado(a.id);
  ok(apA?.success === true && s.resumen === 'CANCELADO/CANCELADA/CANCELADO', '1: aprobado: pedido, venta y retiro cancelados', { r: apA?.error, s: s.resumen });
  ok(s.d?.motivoCancelacion === 'ME EQUIVOQUÉ DE LOCAL', '1: el retiro guarda el motivo del cliente', s.d?.motivoCancelacion);
  ok((await filaDelivery(s.d.id))?.estado === 'CANCELADO', '1: la lista de delivery lo muestra cancelado');
  ok(await enCola(a.numero) === null, '1: sale de la cola');
  ok(/VENTA_CANCELADA/.test(await lanza(() => cobrar(a.ventaId))), '1: no se puede cobrar la venta cancelada');
  ok(!!(await lanza(() => invokeHandler('delivery-cambiar-estado', s.d.id, 'ENTREGADO'))), '1: no se puede entregar el retiro cancelado');
  s = await estado(a.id);
  ok(s.resumen === 'CANCELADO/CANCELADA/CANCELADO', '1: tras los intentos, todo sigue cancelado', s.resumen);

  // ═══════ [2] «No se puede» y el pedido sigue hasta entregarse ═══════
  console.log('\n[2] El local dice «no se puede» y el pedido sigue');
  const b = await materializado();
  await pedirCancelar(b.id, 'apuro');
  const noB: any = await invokeHandler('resolver-cancelacion-pedido-online', b.id, false, 'ya está en el horno');
  s = await estado(b.id);
  ok(noB?.success === true && s.resumen === 'EN_PREPARACION/ABIERTA/ABIERTO' && s.p?.cancelacionRespuesta === 'YA ESTÁ EN EL HORNO',
    '2: rechazada la solicitud: todo sigue y queda la respuesta', { r: noB?.error, s: s.resumen, resp: s.p?.cancelacionRespuesta });
  ok(await enCola(b.numero) === null, '2: sale de la cola (ya respondida)');
  await invokeHandler('delivery-cambiar-estado', s.d.id, 'PARA_ENTREGA');
  ok((await estado(b.id)).p?.estado === 'LISTO', '2: el retiro listo pone el pedido LISTO');
  ok(/cobrada/.test(await lanza(() => invokeHandler('delivery-cambiar-estado', s.d.id, 'ENTREGADO'))), '2: sin cobrar no se entrega');
  await cobrar(b.ventaId);
  await invokeHandler('delivery-cambiar-estado', s.d.id, 'ENTREGADO');
  s = await estado(b.id);
  ok(s.resumen === 'ENTREGADO/CONCLUIDA/ENTREGADO', '2: cobrado y entregado: los tres terminados', s.resumen);

  // ═══════ [3] Pagado online y cancelado desde el diálogo de delivery ═══════
  console.log('\n[3] Pagado online, cancelado desde el diálogo de delivery');
  const c = await materializado({ metodoPago: 'UPAY', pagoModalidad: 'ONLINE', estadoPago: 'PAGADO', pagoMonto: 45000, pagoId: 'UP-123' });
  s = await estado(c.id);
  ok((await filaDelivery(s.d.id))?.pedidoWeb?.estadoPago === 'PAGADO', '3: la fila muestra el pago online');
  await invokeHandler('delivery-cancelar', s.d.id, 'cliente no vino');
  s = await estado(c.id);
  ok(s.resumen === 'CANCELADO/CANCELADA/CANCELADO' && s.p?.estadoPago === 'REEMBOLSO_PENDIENTE',
    '3: cancelado desde delivery: los tres cancelados y el pago queda a devolver', { s: s.resumen, pago: s.p?.estadoPago });
  ok(await enCola(c.numero) === 'DEVOLVER', '3: entra a la cola como DEVOLVER');
  const k3: any = await invokeHandler('contar-pedidos-online-pendientes');
  ok(k3.devoluciones === 1 && k3.total >= 1, '3: el badge la cuenta (sin sonar)', k3);
  const dev: any = await invokeHandler('marcar-pago-devuelto-pedido-online', c.id);
  ok(dev?.success === true && (await estado(c.id)).p?.estadoPago === 'DEVUELTO' && await enCola(c.numero) === null,
    '3: «ya devolví» lo marca DEVUELTO y sale de la cola', dev);

  // ═══════ [4] Aceptado sin venta → enviar a cocina ═══════
  console.log('\n[4] Aceptado sin venta → enviar a cocina');
  const d = await nuevoPedido();
  ok(await enCola(d.numero) === 'SIN_COCINA', '4: aceptado sin venta entra como SIN_COCINA');
  const matD: any = await invokeHandler('materializar-pedido-online-en-venta', d.id, { cajaId: caja.id });
  s = await estado(d.id);
  ok(!!matD?.ventaId && s.resumen === 'EN_PREPARACION/ABIERTA/ABIERTO', '4: enviado a cocina: venta y retiro creados', s.resumen);
  ok(await enCola(d.numero) === null, '4: sale de la cola');
  ok((await filaDelivery(s.d.id))?.pedidoWeb?.numero === d.numero, '4: aparece en la lista de delivery con su número PO');

  // ═══════ [5] Rechazo desde la bandeja de un pedido ya materializado ═══════
  console.log('\n[5] El local rechaza un pedido ya materializado');
  const e5 = await materializado();
  const rech: any = await invokeHandler('rechazar-pedido-online', e5.id, 'sin stock');
  s = await estado(e5.id);
  ok(rech?.success === true && s.resumen === 'RECHAZADO/CANCELADA/CANCELADO', '5: rechazado: venta y retiro cancelados', { r: rech?.error, s: s.resumen });

  // ═══════ [6] Solicitud sin responder y el pedido se entrega ═══════
  console.log('\n[6] Solicitud sin responder y el pedido se entrega');
  const f = await materializado();
  await pedirCancelar(f.id, 'tarda');
  s = await estado(f.id);
  await invokeHandler('delivery-cambiar-estado', s.d.id, 'PARA_ENTREGA');
  await cobrar(f.ventaId);
  await invokeHandler('delivery-cambiar-estado', s.d.id, 'ENTREGADO');
  s = await estado(f.id);
  ok(s.p?.estado === 'ENTREGADO' && !s.p?.cancelacionSolicitadaEn && s.p?.cancelacionRespuesta === 'EL PEDIDO YA HABÍA SALIDO',
    '6: entregado: la solicitud se cierra sola con su respuesta', { e: s.p?.estado, resp: s.p?.cancelacionRespuesta });
  ok(await enCola(f.numero) === null, '6: no queda en la cola');

  // ═══════ [7] La venta se cancela desde el PdV ═══════
  console.log('\n[7] La venta del pedido se cancela desde el PdV');
  const g = await materializado();
  await invokeHandler('updateVenta', g.ventaId, { estado: 'CANCELADA' });
  s = await estado(g.id);
  ok(s.v?.estado === 'CANCELADA' && s.p?.estado === 'CANCELADO', '7: el pedido queda cancelado con su venta', s.resumen);
  ok(s.d?.estado === 'CANCELADO', '7: el retiro se cancela con la venta', s.resumen);
  // Un delivery viejo que quedó vivo sobre una venta cancelada (antes de este arreglo) no avanza.
  await R(Delivery).update({ id: s.d.id }, { estado: 'ABIERTO' } as any);
  ok(/VENTA_CANCELADA/.test(await lanza(() => invokeHandler('delivery-cambiar-estado', s.d.id, 'PARA_ENTREGA'))),
    '7: un delivery vivo sobre una venta cancelada no avanza');
  await R(Delivery).update({ id: s.d.id }, { estado: 'CANCELADO' } as any);
  ok(/VENTA_DE_PEDIDO_CANCELADO/.test(await lanza(() => invokeHandler('updateVenta', g.ventaId, { estado: 'CONCLUIDA' }))),
    '7: no se rehabilita la venta de un pedido web cancelado');
  // Una venta común (sin pedido web) se sigue rehabilitando.
  const comun = await save(Venta, { estado: 'CANCELADA', caja: { id: caja.id } } as any);
  ok(!(await lanza(() => invokeHandler('updateVenta', comun.id, { estado: 'CONCLUIDA' }))), '7: una venta sin pedido web se rehabilita como siempre');

  // ═══════ [8] Avanzar desde la bandeja no pisa una cancelación ═══════
  console.log('\n[8] Avanzar desde la bandeja');
  const h = await materializado();
  const avH: any = await invokeHandler('avanzar-estado-pedido-online', h.id, 'LISTO');
  s = await estado(h.id);
  ok(avH?.success === true && s.p?.estado === 'LISTO' && s.d?.estado === 'PARA_ENTREGA', '8: avanzar a LISTO mueve el pedido y el retiro', { r: avH?.error, s: s.resumen });
  await invokeHandler('rechazar-pedido-online', h.id, 'prueba');
  const avH2: any = await invokeHandler('avanzar-estado-pedido-online', h.id, 'ENTREGADO');
  s = await estado(h.id);
  ok(avH2?.success === false && s.p?.estado === 'RECHAZADO', '8: un pedido ya rechazado no se «revive» al avanzarlo', { r: avH2, s: s.resumen });

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
