/**
 * F8b fase 2 (docs/planes/PLAN-tienda-f8b-credito.md): compra a cuenta desde la tienda.
 *
 *  [1] quién puede: interruptor de la tienda, cuenta vinculada, cliente con crédito, identidad
 *      verificada; lo que mande el storefront no alcanza
 *  [2] disponible: límite − saldo − pedidos a cuenta sin aceptar; límite duro; límite 0 = sin crédito;
 *      dos pedidos simultáneos no gastan el mismo crédito
 *  [3] al aceptar nace la deuda: venta saldada con CREDITO, CPC de 1 cuota a fin de mes,
 *      MovimientoCliente CARGO, saldo; no se cobra dos veces a crédito
 *  [4] el cliente pierde el crédito o le bajan el límite antes de aceptar → no se acepta, sin deuda
 *  [5] cancelar revierte deuda y saldo; recalcular el saldo da lo mismo
 *
 * Uso: npm run test:tienda-credito   ·   … -- --pg (Postgres temporal)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { installHandlerRegistry, invokeHandler, invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';

const PG = process.argv.includes('--pg');
const TAG = PG ? '[credito-pg]' : '[credito]';
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
    const dbFile = path.join(tmpDir, 'test-tienda-credito.db');
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
  const nombre = `frc_gourmet_creditotest_${process.pid}`;
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
  const save = (ent: any, data: any): Promise<any> => R(ent).save(R(ent).create(data as any) as any);
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
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { CuentaCliente } = E('pedidos-online/cuenta-cliente.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { TiendaOnlineConfig } = E('pedidos-online/tienda-online-config.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');
  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');

  const gs = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'CLASICAS', activo: true, familia: await save(Familia, { nombre: 'HAMBURGUESAS', activo: true }) });
  const producto = await save(Producto, { nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda: gs, tipoPrecio, presentacion });
  const caja = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), dispositivo: await save(Dispositivo, { nombre: 'CAJA1', activo: true }),
    conteoApertura: await save(Conteo, {}), activo: true,
  });
  await save(PdvConfig, { autoImprimirComanda: false });

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const rol = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'PEDIDOS_ONLINE_CONFIGURAR', 'CLIENTES_VER', 'CLIENTES_GESTIONAR', 'CPC_GESTIONAR', 'VENTAS_DELIVERY_CANCELAR_COBRADO']) {
    await save(RolePermission, { role: rol, permission: await save(Permission, { codigo, descripcion: codigo, activo: true }) });
  }
  await save(UsuarioRole, { usuario: admin, role: rol });

  installHandlerRegistry();
  const getUser = () => admin;
  const { registerVentasHandlers, materializarPedidoOnlineEnVenta } = require('../electron/handlers/ventas.handler');
  registerVentasHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online.handler').registerPedidosOnlineHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-pedidos.handler').registerPedidosOnlinePedidosHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-admin.handler').registerPedidosOnlineAdminHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-config.handler').registerPedidosOnlineConfigHandlers(ds, getUser);
  require('../electron/handlers/pedidos-online-auth.handler').registerPedidosOnlineAuthHandlers(ds, getUser);
  require('../electron/handlers/delivery.handler').registerDeliveryHandlers(ds, getUser);
  require('../electron/handlers/cuentas-tienda.handler').registerCuentasTiendaHandlers(ds, getUser);
  require('../electron/handlers/cuentas-por-cobrar.handler').registerCuentasPorCobrarHandlers(ds, getUser);
  const { reiniciarLimitesTienda } = require('../electron/utils/tienda-limites');
  const { finDeMes } = require('../electron/utils/credito-tienda.utils');

  const cliente = async (nombre: string, extra: any) => save(Cliente, { persona: await save(Persona, { nombre }), activo: true, saldoActual: 0, ...extra });
  let tel = 595981000100;
  const cuentaVinculada = async (cli: any, extra: any = {}) => {
    const c = await save(CuentaCliente, { telefono: String(tel++), telefonoVerificado: true, nombre: 'CLIENTE WEB', activo: true, ...extra });
    if (cli) {
      const r: any = await invokeHandler('vincular-cuenta-tienda', c.id, cli.id);
      if (!r?.success) throw new Error('no se pudo vincular: ' + JSON.stringify(r));
    }
    return c;
  };
  const ctx = (c: any) => ({ customerId: c.id, clientIp: '10.0.0.5' } as any);
  const pedir = (c: any, cantidad = 1, metodoPago = 'CREDITO'): Promise<any> => {
    reiniciarLimitesTienda();
    return invokeHandlerWithContext('crear-pedido-online', ctx(c), {
      tipoPedido: 'PICKUP', metodoPago, items: [{ productoId: producto.id, presentacionId: presentacion.id, cantidad }],
    });
  };
  const fila = (numero: string): Promise<any> => R(PedidoOnline).findOne({ where: { numero } });
  const me = async (c: any) => ((await invokeHandlerWithContext('pub-cliente-me', ctx(c))) as any)?.credito ?? null;
  const aceptar = async (numero: string) => {
    const p = await fila(numero);
    await R(PedidoOnline).update({ id: p.id }, { estado: 'ACEPTADO' } as any);
    return materializarPedidoOnlineEnVenta(ds, p.id, { cajaId: caja.id }, admin.id);
  };
  const saldo = async (cli: any) => Number(((await R(Cliente).findOne({ where: { id: cli.id } })) as any).saldoActual);
  const cfgTienda = async (metodos: string[]) => {
    const cfg: any = (await R(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } })) || await save(TiendaOnlineConfig, { activa: true, permitePickup: true, permiteDelivery: true, prepTimeMinutos: 30 });
    await R(TiendaOnlineConfig).update({ id: cfg.id }, { metodosPago: JSON.stringify(metodos) } as any);
  };

  const juan = await cliente('JUAN', { credito: true, limite_credito: 100000 });
  const cJuan = await cuentaVinculada(juan);

  // ═══════ [1] Quién puede ═══════
  console.log('\n[1] Quién puede comprar a cuenta');
  await cfgTienda(['EFECTIVO']);
  ok((await pedir(cJuan))?.error === 'metodo_pago_no_disponible', '1: con la tienda sin «A cuenta», se rechaza');
  const guardado: any = await invokeHandler('update-tienda-online-config', { creditoTienda: true });
  const cfgLeida: any = await R(TiendaOnlineConfig).findOne({ where: {}, order: { id: 'ASC' } });
  ok(guardado?.config?.creditoTienda === true && JSON.parse(cfgLeida.metodosPago).includes('CREDITO') && JSON.parse(cfgLeida.metodosPago).includes('EFECTIVO'),
    '1: el interruptor de la config se guarda en la misma lista sin perder los otros métodos', cfgLeida?.metodosPago);
  const pub: any = await invokeHandler('get-tienda-online-config-public');
  ok(pub?.compraACuenta === true && !(pub?.metodosPago || []).includes('CREDITO'), '1: la config pública lo anuncia aparte, no como método al recibir', pub);
  const sinMetodos: any = await invokeHandler('update-tienda-online-config', { metodosPago: ['EFECTIVO', 'QR'] });
  ok(sinMetodos?.config?.creditoTienda === true, '1: cambiar los métodos al recibir no apaga «A cuenta»');
  const sinVinculo = await cuentaVinculada(null);
  ok((await pedir(sinVinculo))?.error === 'credito_no_habilitado', '1: una cuenta sin vincular no compra a cuenta');
  ok((await me(sinVinculo)) === null, '1: y «mi cuenta» no le ofrece crédito');
  const ana = await cliente('ANA', { credito: false });
  ok((await pedir(await cuentaVinculada(ana)))?.error === 'credito_no_habilitado', '1: cliente vinculado sin crédito → no');
  const pedro = await cliente('PEDRO', { credito: true, limite_credito: 100000 });
  const cSinVerificar = await cuentaVinculada(pedro, { telefono: null, telefonoVerificado: false, email: 'p@x.com', emailVerificado: false, telefonoContacto: '595981999888' });
  ok((await pedir(cSinVerificar))?.error === 'credito_no_habilitado', '1: vinculada pero sin teléfono ni correo verificado → no');
  ok((await me(cSinVerificar)) === null, '1: y no se le ofrece');
  const cGoogle = await save(CuentaCliente, { email: 'g@x.com', emailVerificado: true, nombre: 'GOOGLE', activo: true });
  const lucia = await cliente('LUCIA', { credito: true, limite_credito: 100000 });
  await invokeHandler('vincular-cuenta-tienda', cGoogle.id, lucia.id);
  ok((await me(cGoogle))?.disponible === 100000, '1: correo verificado (Google) sí, con su disponible', await me(cGoogle));

  // ═══════ [2] Disponible ═══════
  console.log('\n[2] Disponible y límite');
  ok((await me(cJuan))?.disponible === 100000, '2: disponible inicial = límite', await me(cJuan));
  const p1: any = await pedir(cJuan);
  const f1 = await fila(p1.numero);
  ok(p1?.success === true && f1.metodoPago === 'CREDITO' && f1.pagoModalidad === 'A_CUENTA' && f1.clienteId === juan.id, '2: pedido a cuenta creado', p1);
  ok((await me(cJuan))?.disponible === 55000, '2: el pedido sin aceptar reserva su monto', await me(cJuan));
  const p2: any = await pedir(cJuan);
  ok(p2?.success === true && (await me(cJuan))?.disponible === 10000, '2: un segundo pedido entra justo', await me(cJuan));
  const p3: any = await pedir(cJuan);
  ok(p3?.error === 'credito_insuficiente' && p3?.disponible === 10000, '2: el tercero no alcanza: límite duro', p3);
  ok((await pedir(cJuan, 1, 'EFECTIVO'))?.success === true, '2: en efectivo sí puede pedir');
  ok(await saldo(juan) === 0, '2: sin aceptar, todavía no hay deuda');

  const marta = await cliente('MARTA', { credito: true, limite_credito: 50000 });
  const cMarta = await cuentaVinculada(marta);
  reiniciarLimitesTienda();
  const pedirSinReset = () => invokeHandlerWithContext('crear-pedido-online', ctx(cMarta), {
    tipoPedido: 'PICKUP', metodoPago: 'CREDITO', items: [{ productoId: producto.id, presentacionId: presentacion.id, cantidad: 1 }],
  });
  const dos: any[] = await Promise.all([pedirSinReset(), pedirSinReset()]);
  ok(dos.filter((r) => r?.success).length === 1 && dos.some((r) => r?.error === 'credito_insuficiente'), '2: dos pedidos simultáneos no gastan el mismo crédito', dos);

  // Límite 0 = sin crédito (decisión 2026-11-09, web y PdV).
  const cero = await cliente('CERO', { credito: true, limite_credito: 0 });
  const cCero = await cuentaVinculada(cero);
  ok((await me(cCero)) == null, '2: límite 0 = sin crédito (no se ofrece «A cuenta»)', await me(cCero));
  ok((await pedir(cCero, 1))?.error === 'credito_no_habilitado', '2: con límite 0 no se puede pedir a cuenta');
  const rico = await cliente('RICO', { credito: true, limite_credito: 10000000 });
  const cRico = await cuentaVinculada(rico);
  ok((await pedir(cRico, 5))?.success === true, '2: con un límite grande pide lo que alcanza');

  // ═══════ [3] La deuda nace al aceptar ═══════
  console.log('\n[3] Al aceptar nace la deuda');
  const mat = await aceptar(p1.numero);
  const venta: any = await R(Venta).findOne({ where: { id: mat.ventaId }, relations: ['cliente', 'pago'] });
  ok(venta?.estado === 'ABIERTA' && venta?.cliente?.id === juan.id, '3: venta abierta a nombre del cliente', { e: venta?.estado, c: venta?.cliente?.id });
  const det: any[] = await R(PagoDetalle).find({ where: { pago: { id: venta.pago.id } }, relations: ['formaPago'] });
  ok(det.length === 1 && det[0].formaPago?.nombre === 'CREDITO' && Number(det[0].valor) === 45000, '3: la venta queda saldada con un pago CREDITO por el total', det.map((d) => [d.formaPago?.nombre, d.valor]));
  const cpcs: any[] = await R(CuentaPorCobrar).find({ where: { ventaId: venta.id }, relations: ['cliente'] });
  ok(cpcs.length === 1 && Number(cpcs[0].montoTotal) === 45000 && cpcs[0].cliente?.id === juan.id && cpcs[0].estado === 'ACTIVO' && cpcs[0].cantidadCuotas === 1, '3: una cuenta por cobrar por el total', cpcs);
  const cuotas: any[] = await R(CuentaPorCobrarCuota).find({ where: { cuentaPorCobrar: { id: cpcs[0].id } } });
  const fdm = finDeMes(new Date());
  const ymd = (d: any) => (d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    : String(d).slice(0, 10));
  ok(cuotas.length === 1 && Number(cuotas[0].monto) === 45000 && ymd(cuotas[0].fechaVencimiento) === ymd(fdm),
    '3: una cuota que vence el último día del mes', cuotas.map((c) => c.fechaVencimiento));
  const movs: any[] = await R(MovimientoCliente).find({ where: { cliente: { id: juan.id } } });
  ok(movs.length === 1 && movs[0].tipo === 'CARGO' && Number(movs[0].monto) === 45000, '3: movimiento CARGO del cliente', movs.map((m) => [m.tipo, m.monto]));
  ok(await saldo(juan) === 45000, '3: el saldo sube', await saldo(juan));
  ok((await me(cJuan))?.disponible === 10000, '3: el disponible no cambia (la reserva pasó a ser deuda)', await me(cJuan));
  ok(/ya tiene una cuenta por cobrar/.test(await lanza(() => invokeHandler('cobrar-venta-credito', {
    ventaId: venta.id, clienteId: juan.id, montoTotal: 45000, monedaId: gs.id, cantidadCuotas: 1, forzar: true,
  }))), '3: no se puede cobrar otra vez a crédito');
  ok((await R(CuentaPorCobrar).count({ where: { ventaId: venta.id } })) === 1 && await saldo(juan) === 45000, '3: sigue una sola deuda');

  // ═══════ [4] Cambios antes de aceptar ═══════
  console.log('\n[4] El cliente cambia antes de aceptar');
  await R(Cliente).update({ id: juan.id }, { credito: false } as any);
  ok(/credito_no_habilitado/.test(await lanza(() => aceptar(p2.numero))), '4: perdió el crédito → no se acepta');
  ok(!(await fila(p2.numero)).ventaId && await saldo(juan) === 45000 && (await R(CuentaPorCobrar).count({ where: { cliente: { id: juan.id } } })) === 1, '4: y no queda venta ni deuda nueva');
  await R(Cliente).update({ id: juan.id }, { credito: true, limite_credito: 60000 } as any);
  ok(/credito_insuficiente/.test(await lanza(() => aceptar(p2.numero))), '4: le bajaron el límite y ya no alcanza → no se acepta');
  await R(Cliente).update({ id: juan.id }, { limite_credito: 100000 } as any);
  const mat2 = await aceptar(p2.numero);
  ok(!!mat2?.ventaId && await saldo(juan) === 90000, '4: con el límite repuesto, se acepta', await saldo(juan));

  // ═══════ [3b] Entregar ═══════
  console.log('\n[3b] Entregar un pedido a cuenta');
  const p4: any = await pedir(cRico);
  const mat4 = await aceptar(p4.numero);
  const f4 = await fila(p4.numero);
  await invokeHandler('delivery-cambiar-estado', f4.deliveryId, 'PARA_ENTREGA');
  const conc: any = await invokeHandler('updateVenta', mat4.ventaId, { estado: 'CONCLUIDA' }).catch((e: any) => ({ error: String(e?.message || e) }));
  const v4: any = await R(Venta).findOne({ where: { id: mat4.ventaId } });
  ok(v4?.estado === 'CONCLUIDA', '3b: la venta saldada a cuenta se concluye sin cobrar nada más', conc?.error || v4?.estado);
  await invokeHandler('delivery-cambiar-estado', f4.deliveryId, 'ENTREGADO');
  ok((await fila(p4.numero)).estado === 'ENTREGADO', '3b: el retiro se entrega y el pedido queda ENTREGADO', (await fila(p4.numero)).estado);
  ok((await R(CuentaPorCobrar).count({ where: { ventaId: mat4.ventaId, estado: 'ACTIVO' } })) === 1 && await saldo(rico) === 45000,
    '3b: una sola deuda, la del pedido (el otro de este cliente sigue sin aceptar)', await saldo(rico));

  // ═══════ [4b] Auditoría ═══════
  console.log('\n[4b] Aceptar sin crédito, reservas en el PdV y fin de mes');
  const sol = await cliente('SOL', { credito: true, limite_credito: 50000 });
  const cSol = await cuentaVinculada(sol);
  const pSol: any = await pedir(cSol);
  await R(Cliente).update({ id: sol.id }, { credito: false } as any);
  const ac: any = await invokeHandler('aceptar-pedido-online', (await fila(pSol.numero)).id, { cajaId: caja.id });
  ok(ac?.error === 'credito_no_habilitado' && (await fila(pSol.numero)).estado === 'RECIBIDO', '4b: aceptar sin crédito se corta antes: el pedido sigue RECIBIDO', ac);
  await R(Cliente).update({ id: sol.id }, { credito: true } as any);
  // Venta común del PdV a crédito para el mismo cliente: el pedido web sin aceptar ya reserva 45.000.
  const { Venta: V } = { Venta };
  const vPdv = await save(V, { estado: 'ABIERTA', caja: { id: caja.id }, cliente: { id: sol.id } });
  const aviso: any = await invokeHandler('cobrar-venta-credito', { ventaId: vPdv.id, clienteId: sol.id, montoTotal: 10000, monedaId: gs.id, cantidadCuotas: 1 })
    .catch((e: any) => ({ error: String(e?.message || e) }));
  ok(/No alcanza el crédito/.test(aviso?.error || '') && /pedidos web a cuenta/.test(aviso?.error || ''), '4b: la venta a crédito del PdV cuenta lo reservado por la web y se bloquea', aviso);
  const forzada: any = await invokeHandler('cobrar-venta-credito', { ventaId: vPdv.id, clienteId: sol.id, montoTotal: 10000, monedaId: gs.id, cantidadCuotas: 1, forzar: true })
    .catch((e: any) => ({ error: String(e?.message || e) }));
  ok(/No alcanza el crédito/.test(forzada?.error || ''), '4b: pasarse del límite ya no se puede «forzar»', forzada);
  const sinLim = await cliente('SINLIMITE', { credito: true, limite_credito: 0 });
  const vSin = await save(V, { estado: 'ABIERTA', caja: { id: caja.id }, cliente: { id: sinLim.id } });
  const rSin: any = await invokeHandler('cobrar-venta-credito', { ventaId: vSin.id, clienteId: sinLim.id, montoTotal: 1000, monedaId: gs.id, cantidadCuotas: 1 })
    .catch((e: any) => ({ error: String(e?.message || e) }));
  ok(/no tiene límite de crédito/.test(rSin?.error || ''), '4b: en el PdV, límite 0 = sin crédito', rSin);
  const ac2: any = await invokeHandler('aceptar-pedido-online', (await fila(pSol.numero)).id, { cajaId: caja.id });
  ok(ac2?.success === true && !!(await fila(pSol.numero)).ventaId && await saldo(sol) === 45000, '4b: con crédito, se acepta y nace la deuda', ac2);
  const fdmUtc = finDeMes(new Date('2026-12-01T01:00:00Z'));
  ok(fdmUtc.getMonth() === 10 && fdmUtc.getDate() === 30, '4b: aceptado el 30/11 a las 22:00 de Asunción (1/12 UTC) vence el 30/11', fdmUtc.toString());

  // ═══════ [5] Cancelar revierte ═══════
  console.log('\n[5] Cancelar revierte la deuda');
  const rr: any = await invokeHandler('rechazar-pedido-online', (await fila(p1.numero)).id, 'sin stock');
  ok(rr?.success === true, '5: rechazado el pedido aceptado', rr);
  const cpc1: any = await R(CuentaPorCobrar).findOne({ where: { ventaId: venta.id } });
  ok(cpc1?.estado === 'CANCELADO' && await saldo(juan) === 45000, '5: su deuda se cancela y el saldo baja', { e: cpc1?.estado, s: await saldo(juan) });
  const ajustes: any[] = await R(MovimientoCliente).find({ where: { cliente: { id: juan.id }, tipo: 'AJUSTE_NEGATIVO' } });
  ok(ajustes.length === 1 && Number(ajustes[0].monto) === 45000, '5: con su movimiento de reversa', ajustes.length);
  const rec: any = await invokeHandler('recalcular-saldo-cliente', juan.id);
  ok(await saldo(juan) === 45000, '5: recalcular el saldo desde los movimientos da lo mismo', { rec, s: await saldo(juan) });
  ok((await me(cJuan))?.disponible === 55000, '5: el disponible vuelve', await me(cJuan));

  await cerrar();
  console.log(`\n${TAG} RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(`${TAG} FATAL:`, e); process.exit(1); });
