/**
 * E2E: el pedido online de la tienda sigue a lo que pasa en el PdV.
 *
 * El cajero no opera desde la bandeja de pedidos online: mueve el delivery (o el
 * retiro) desde su panel y cobra la mesa en la mesa. Antes el pedido quedaba
 * EN_PREPARACION para siempre y el cliente lo veía así en «Mis pedidos».
 *
 *  [A] delivery: PARA_ENTREGA → LISTO, EN_CAMINO → EN_CAMINO, ENTREGADO → ENTREGADO
 *  [B] el pedido nunca retrocede (el delivery sí puede volver a PARA_ENTREGA)
 *  [C] retiro: PARA_ENTREGA → LISTO, ENTREGADO → ENTREGADO
 *  [D] cancelar el delivery cancela el pedido (motivo; pagado online → a devolver)
 *  [E] mesa: cobrar la cuenta (updateVenta) entrega sus pedidos; uno rechazado no se toca
 *  [F] mesa: cancelar la cuenta (cerrarVentasAbiertasMesa) cancela sus pedidos
 *  [G] transferir la mesa: los pedidos pasan a la cuenta destino y se entregan al cobrarla
 *  [H] cobrar una venta de delivery no marca el pedido entregado (eso lo hace el delivery)
 *
 * Uso: npm run test:pedidos-online-sync
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers, stopRetryComandaWorker } from '../electron/handlers/ventas.handler';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pedidos-online-sync.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const ds = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[sync] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');

  const save = (ent: any, data: any): Promise<any> => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const pedidoDe = async (id: number): Promise<any> => ds.getRepository(PedidoOnline).findOne({ where: { id } });

  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const rol: any = await save(Role, { descripcion: 'CAJERO', activo: true });
  for (const codigo of ['VENTAS_PDV', 'VENTAS_DELIVERY_CANCELAR_COBRADO', 'PEDIDOS_ONLINE_GESTIONAR']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role: rol, permission: perm });
  }
  await save(UsuarioRole, { usuario: cajero, role: rol });

  await save(PdvConfig, { cantidad_mesas: 0 });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), activo: true,
    dispositivo: await save(Dispositivo, { nombre: 'CAJA-SYNC', activo: true }), conteoApertura: await save(Conteo, {}),
  });
  const zona: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 5000, activo: true });
  const repartidor: any = await save(Funcionario, {
    persona: await save(Persona, { nombre: 'JUAN REPARTIDOR' }), cargo: await save(Cargo, { nombre: 'REPARTIDOR', activo: true }),
    fechaIngreso: '2026-01-01', activo: true,
  });
  const moneda: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const formaPago: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true });

  registerVentasHandlers(ds, () => cajero);
  registerDeliveryHandlers(ds, () => cajero);
  stopRetryComandaWorker();

  let seq = 0;
  const nuevoPedido = (data: any) => save(PedidoOnline, {
    numero: `PO-SYNC${String(++seq).padStart(2, '0')}`, canalOrigen: 'WEB', metodoPago: 'EFECTIVO',
    subtotal: 20000, costoEnvio: 0, total: 20000, estado: 'EN_PREPARACION', ...data,
  });
  const crearDelivery = (over: any = {}): Promise<any> => invokeHandler('delivery-crear', {
    cajaId: caja.id, telefono: '0981123456', nombre: 'CLIENTE PRUEBA', direccion: 'CALLE 1', precioDeliveryId: zona.id, ...over,
  });
  const item = (ventaId: number, precio = 20000) => save(VentaItem, {
    venta: { id: ventaId }, cantidad: 1, precioVentaUnitario: precio, precioCostoUnitario: 0,
    estado: 'ACTIVO', precioAdicionales: 0, descuentoUnitario: 0, montoCubierto: 0,
  });
  const nuevoPago = async (monto: number) => {
    const pago: any = await save(Pago, {});
    await save(PagoDetalle, { pago, moneda, formaPago, valor: monto, tipo: 'PAGO', descripcion: 'EFECTIVO', activo: true });
    return pago;
  };
  /** Cobro como el del PdV: el pago y la conclusión por `updateVenta`. */
  const cobrar = async (ventaId: number, monto: number) =>
    invokeHandler('updateVenta', ventaId, { estado: 'CONCLUIDA', pago: { id: (await nuevoPago(monto)).id }, fechaCierre: new Date() });
  let seqMesa = 0;
  const mesaConVenta = async () => {
    const mesa: any = await save(PdvMesa, { numero: ++seqMesa, estado: 'OCUPADO', activo: true, reservado: false });
    const venta: any = await save(Venta, { estado: 'ABIERTA', caja: { id: caja.id }, mesa: { id: mesa.id } });
    await item(venta.id);
    return { mesa, venta };
  };

  // ═══════ [A] Delivery ═══════
  console.log('\n[A] Delivery: el pedido sigue al panel de delivery');
  {
    const { delivery, venta } = await crearDelivery();
    await item(venta.id);
    const ped: any = await nuevoPedido({ tipoPedido: 'DELIVERY', ventaId: venta.id, deliveryId: delivery.id });

    await invokeHandler('delivery-cambiar-estado', delivery.id, 'PARA_ENTREGA');
    let p = await pedidoDe(ped.id);
    ok(p.estado === 'LISTO' && !!p.fechaListo, 'A: PARA_ENTREGA → pedido LISTO (con fechaListo)', p.estado);

    await invokeHandler('delivery-cambiar-estado', delivery.id, 'EN_CAMINO', { funcionarioId: repartidor.id });
    p = await pedidoDe(ped.id);
    ok(p.estado === 'EN_CAMINO', 'A: EN_CAMINO → pedido EN_CAMINO', p.estado);

    // [B] El delivery puede volver a PARA_ENTREGA; el pedido no retrocede.
    await invokeHandler('delivery-cambiar-estado', delivery.id, 'PARA_ENTREGA');
    p = await pedidoDe(ped.id);
    ok(p.estado === 'EN_CAMINO', 'B: el delivery vuelve a PARA_ENTREGA y el pedido no retrocede', p.estado);
    await invokeHandler('delivery-cambiar-estado', delivery.id, 'EN_CAMINO', { funcionarioId: repartidor.id });

    // [H] Cobrar la venta de un delivery no lo entrega: eso lo marca el delivery.
    await cobrar(venta.id, 25000);
    p = await pedidoDe(ped.id);
    ok(p.estado === 'EN_CAMINO', 'H: cobrar la venta del delivery no marca el pedido entregado', p.estado);

    await invokeHandler('delivery-cambiar-estado', delivery.id, 'ENTREGADO');
    p = await pedidoDe(ped.id);
    ok(p.estado === 'ENTREGADO' && !!p.fechaEntregado, 'A: ENTREGADO → pedido ENTREGADO (con fechaEntregado)', p.estado);
  }

  // ═══════ [A2] La bandeja sigue funcionando y queda igual al delivery ═══════
  console.log('\n[A2] Bandeja: avanzar desde la bandeja mueve el delivery y el pedido');
  {
    const { registerPedidosOnlineAdminHandlers } = require('../electron/handlers/pedidos-online-admin.handler');
    registerPedidosOnlineAdminHandlers(ds, () => cajero);
    const { delivery, venta } = await crearDelivery();
    await item(venta.id);
    const ped: any = await nuevoPedido({ tipoPedido: 'DELIVERY', ventaId: venta.id, deliveryId: delivery.id });
    const r: any = await invokeHandler('avanzar-estado-pedido-online', ped.id, 'LISTO');
    const d: any = await ds.getRepository('Delivery').findOne({ where: { id: delivery.id } });
    const p = await pedidoDe(ped.id);
    ok(r?.success === true && p.estado === 'LISTO' && d.estado === 'PARA_ENTREGA', 'A2: bandeja → LISTO; delivery PARA_ENTREGA', [r, p.estado, d.estado]);
  }

  // ═══════ [C] Retiro ═══════
  console.log('\n[C] Retiro en el local');
  {
    const { delivery, venta } = await crearDelivery({ modo: 'RETIRO', direccion: '' });
    await item(venta.id);
    const ped: any = await nuevoPedido({ tipoPedido: 'PICKUP', ventaId: venta.id, deliveryId: delivery.id });
    await invokeHandler('delivery-cambiar-estado', delivery.id, 'PARA_ENTREGA');
    ok((await pedidoDe(ped.id)).estado === 'LISTO', 'C: retiro PARA_ENTREGA → pedido LISTO');
    await cobrar(venta.id, 20000);
    await invokeHandler('delivery-cambiar-estado', delivery.id, 'ENTREGADO');
    ok((await pedidoDe(ped.id)).estado === 'ENTREGADO', 'C: retiro ENTREGADO → pedido ENTREGADO');
  }

  // ═══════ [D] Cancelación del delivery ═══════
  console.log('\n[D] Cancelar el delivery cancela el pedido');
  {
    const { delivery, venta } = await crearDelivery();
    await item(venta.id);
    const ped: any = await nuevoPedido({ tipoPedido: 'DELIVERY', ventaId: venta.id, deliveryId: delivery.id, metodoPago: 'UPAY', estadoPago: 'PAGADO' });
    await invokeHandler('delivery-cancelar', delivery.id, 'cliente no atiende');
    const p = await pedidoDe(ped.id);
    ok(p.estado === 'CANCELADO' && p.motivoRechazo === 'CLIENTE NO ATIENDE', 'D: pedido CANCELADO con el motivo del PdV', [p.estado, p.motivoRechazo]);
    ok(p.estadoPago === 'REEMBOLSO_PENDIENTE', 'D: pagado online → queda para devolver', p.estadoPago);
  }

  // ═══════ [E] Mesa cobrada ═══════
  console.log('\n[E] Mesa: cobrar la cuenta entrega sus pedidos');
  {
    const { mesa, venta } = await mesaConVenta();
    const p1: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: venta.id, mesaId: mesa.id });
    const p2: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: venta.id, mesaId: mesa.id, estado: 'LISTO' });
    const p3: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: venta.id, mesaId: mesa.id, estado: 'RECHAZADO' });
    await cobrar(venta.id, 20000);
    const [a, b, c] = [await pedidoDe(p1.id), await pedidoDe(p2.id), await pedidoDe(p3.id)];
    ok(a.estado === 'ENTREGADO' && b.estado === 'ENTREGADO', 'E: los pedidos de la mesa quedan ENTREGADOS', [a.estado, b.estado]);
    ok(!!a.fechaEntregado && !!a.fechaListo, 'E: con fechaEntregado (y fechaListo si no la tenía)', [a.fechaListo, a.fechaEntregado]);
    ok(c.estado === 'RECHAZADO', 'E: un pedido rechazado no se toca', c.estado);
  }

  // ═══════ [F] Mesa cancelada ═══════
  console.log('\n[F] Mesa: cancelar la cuenta cancela sus pedidos');
  {
    const { mesa, venta } = await mesaConVenta();
    const p1: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: venta.id, mesaId: mesa.id });
    await invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CANCELADA');
    const p = await pedidoDe(p1.id);
    ok(p.estado === 'CANCELADO' && !!p.motivoRechazo, 'F: pedido CANCELADO con motivo', [p.estado, p.motivoRechazo]);
  }
  {
    // Cobro por el cierre de mesa (con pago registrado) también entrega.
    const { mesa, venta } = await mesaConVenta();
    const p1: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: venta.id, mesaId: mesa.id });
    await ds.getRepository(Venta).update({ id: venta.id }, { pago: { id: (await nuevoPago(20000)).id } } as any);
    await invokeHandler('cerrarVentasAbiertasMesa', mesa.id, 'CONCLUIDA');
    ok((await pedidoDe(p1.id)).estado === 'ENTREGADO', 'F: cerrarVentasAbiertasMesa(CONCLUIDA) entrega los pedidos');
  }

  // ═══════ [G] Transferencia de mesa ═══════
  console.log('\n[G] Transferir la mesa: los pedidos siguen a la cuenta');
  {
    const { mesa: origen, venta: vOrigen } = await mesaConVenta();
    const { mesa: destino, venta: vDestino } = await mesaConVenta();
    const p1: any = await nuevoPedido({ tipoPedido: 'MESA_QR', canalOrigen: 'QR_MESA', ventaId: vOrigen.id, mesaId: origen.id });
    const t: any = await invokeHandler('transferir-venta-pdv', {
      origen: { tipo: 'MESA', id: origen.id }, destino: { tipo: 'MESA', id: destino.id }, alcance: 'COMPLETA',
    });
    let p = await pedidoDe(p1.id);
    ok(t?.origenCerrado === true && p.ventaId === vDestino.id && p.estado === 'EN_PREPARACION',
      'G: el pedido pasa a la cuenta destino y no se cancela', [t?.origenCerrado, p.ventaId, vDestino.id, p.estado]);
    ok(p.mesaId === origen.id, 'G: la mesa donde se pidió no cambia', p.mesaId);
    await cobrar(vDestino.id, 40000);
    p = await pedidoDe(p1.id);
    ok(p.estado === 'ENTREGADO', 'G: al cobrar la cuenta destino el pedido queda ENTREGADO', p.estado);
  }

  await ds.destroy();
  console.log(`\n[sync] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[sync] FATAL:', e); process.exit(1); });
