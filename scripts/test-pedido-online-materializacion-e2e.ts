/**
 * E2E de la materialización de pedidos online en `Venta`.
 *
 * El objetivo del módulo es que un pedido de PICKUP o DELIVERY llegue a la
 * cocina. Antes de este trabajo no llegaba por dos motivos encadenados:
 *
 *  1. `materializarPedidoOnlineEnVenta` exigía `mesaId` y tiraba para todo lo
 *     que no fuera MESA_QR;
 *  2. y aunque se generalizara, los hooks de KDS e impresión se saltean
 *     cualquier venta sin mesa ni comanda ("Venta directa sin cocina"), así que
 *     una venta de pedido web habría quedado igual de invisible.
 *
 * Por eso el assert que importa no es "se creó la Venta" sino **"se creó el
 * ComandaItem"**: es lo único que prueba que el pedido llega a la cocina.
 *
 * Cubre además las dos regresiones que este cambio podría causar:
 * - MESA_QR tiene que seguir funcionando igual (ya está en producción);
 * - la venta rápida de mostrador tiene que seguir SIN ir a cocina.
 *
 * Uso: npm run test:pedido-online-materializacion
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, installHandlerRegistry } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import {
  registerVentasHandlers,
  materializarPedidoOnlineEnVenta,
  crearComandaItemsSiCorresponde,
} from '../electron/handlers/ventas.handler';
import { registerPedidosOnlineAdminHandlers } from '../electron/handlers/pedidos-online-admin.handler';
import { registerDeliveryHandlers } from '../electron/handlers/delivery.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pedido-online-mat.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[materializacion] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data));

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
  const { ProductoSector } = E('productos/producto-sector.entity');
  const { Sector } = E('ventas/sector.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { PdvConfig } = E('ventas/pdv-config.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { ComandaItem } = E('ventas/comanda-item.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { PedidoOnlineItem } = E('pedidos-online/pedido-online-item.entity');

  // ── Fixtures ────────────────────────────────────────────────────────────
  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR']) {
    const permiso = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role, permission: permiso });
  }
  await save(UsuarioRole, { usuario: admin, role });
  const moneda = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const dispositivo = await save(Dispositivo, { nombre: 'CAJA1', activo: true });
  const conteo = await save(Conteo, {});
  await save(Caja, {
    estado: 'ABIERTO', fechaApertura: new Date(), dispositivo, conteoApertura: conteo, activo: true,
  });
  await save(PdvConfig, { autoImprimirComanda: false });

  const familia = await save(Familia, { nombre: 'GENERAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'GENERAL', activo: true, familia });
  const sector = await save(Sector, { nombre: 'COCINA', activo: true });
  const producto = await save(Producto, {
    nombre: 'HAMBURGUESA', tipo: 'RETAIL', activo: true, esVendible: true,
    disponibleOnline: true, pausadoOnline: false, requiereComanda: true, iva: 10, subfamilia,
  });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 45000, principal: true, activo: true, moneda, tipoPrecio, presentacion });
  // El ruteo a cocina es por esta M2M: sin un sector activo no hay ComandaItem.
  await save(ProductoSector, { producto, sector, activo: true, prioridad: 1 });

  installHandlerRegistry();
  registerVentasHandlers(ds, () => admin);
  registerPedidosOnlineAdminHandlers(ds, () => admin);
  registerDeliveryHandlers(ds, () => admin);

  const nuevoPedido = async (tipo: string, mesaId?: number) => {
    const p = await save(PedidoOnline, {
      numero: `PO-TEST-${tipo}-${Math.abs(tipo.length * 7 + (mesaId || 0))}${Date.now() % 100000}`,
      tipoPedido: tipo, estado: 'ACEPTADO', canalOrigen: tipo === 'MESA_QR' ? 'QR_MESA' : 'WEB',
      metodoPago: 'EFECTIVO', subtotal: 45000, costoEnvio: 0, total: 45000,
      nombreCliente: 'CLIENTE PRUEBA', mesaId,
    });
    await save(PedidoOnlineItem, {
      pedido: { id: p.id }, productoId: producto.id, presentacionId: presentacion.id,
      nombreProducto: 'HAMBURGUESA', cantidad: 1, precioUnitario: 45000, subtotal: 45000,
      personalizacion: JSON.stringify({}),
    });
    return p;
  };

  const comandaItemsDe = async (ventaId: number) => R(ComandaItem)
    .createQueryBuilder('ci')
    .innerJoin('ci.ventaItem', 'vi')
    .innerJoin('vi.venta', 'v')
    .where('v.id = :ventaId', { ventaId })
    .getCount();

  // ── 1 · PICKUP ──────────────────────────────────────────────────────────
  console.log('\n[1] PICKUP se materializa y llega a cocina');
  const pPickup = await nuevoPedido('PICKUP');
  const matPickup = await materializarPedidoOnlineEnVenta(ds, pPickup.id, undefined, admin.id);
  ok(!!matPickup.ventaId, 'crea la Venta', matPickup);
  ok(matPickup.itemsCreados === 1, 'vuelca el item', matPickup.itemsCreados);

  const vPickup = await R(Venta).findOne({ where: { id: matPickup.ventaId }, relations: ['mesa'] });
  ok(vPickup?.canalOrigen === 'WEB', 'la venta queda marcada canalOrigen=WEB', vPickup?.canalOrigen);
  ok(!vPickup?.mesa, 'la venta NO tiene mesa');
  ok(vPickup?.estado === 'ABIERTA', 'la venta nace ABIERTA (se cobra después)', vPickup?.estado);
  ok(vPickup?.nombreCliente === 'CLIENTE PRUEBA', 'arrastra el nombre del cliente', vPickup?.nombreCliente);
  ok(await comandaItemsDe(matPickup.ventaId) === 1, 'GENERA ComandaItem → llega a la cocina');

  const pPickupDespues = await R(PedidoOnline).findOneBy({ id: pPickup.id });
  ok(pPickupDespues?.estado === 'EN_PREPARACION', 'el pedido pasa a EN_PREPARACION', pPickupDespues?.estado);
  ok(pPickupDespues?.ventaId === matPickup.ventaId, 'guarda el vínculo ventaId');

  // ── 2 · Idempotencia ────────────────────────────────────────────────────
  console.log('\n[2] Idempotencia');
  const otra = await materializarPedidoOnlineEnVenta(ds, pPickup.id, undefined, admin.id);
  ok(otra.yaMaterializado === true, 'la segunda llamada no vuelve a materializar');
  ok(otra.ventaId === matPickup.ventaId, 'devuelve la misma venta');
  ok(await comandaItemsDe(matPickup.ventaId) === 1, 'no duplica el ComandaItem (no se cocina dos veces)');

  console.log('\n[3] Dos materializaciones simultáneas del mismo pedido → una sola venta');
  const pConc = await nuevoPedido('PICKUP');
  const [a, b] = await Promise.all([
    materializarPedidoOnlineEnVenta(ds, pConc.id, undefined, admin.id),
    materializarPedidoOnlineEnVenta(ds, pConc.id, undefined, admin.id),
  ]);
  ok(a.ventaId === b.ventaId, 'el candado por pedido serializa las dos', { a: a.ventaId, b: b.ventaId });
  ok(await comandaItemsDe(a.ventaId) === 1, 'un solo ComandaItem pese a la concurrencia');

  // ── 4 · DELIVERY ────────────────────────────────────────────────────────
  console.log('\n[4] DELIVERY');
  const pDeli = await nuevoPedido('DELIVERY');
  const matDeli = await materializarPedidoOnlineEnVenta(ds, pDeli.id, undefined, admin.id);
  ok(!!matDeli.ventaId && matDeli.ventaId !== matPickup.ventaId, 'abre una venta propia, no reusa la del pickup');
  ok(await comandaItemsDe(matDeli.ventaId) === 1, 'también llega a la cocina');

  // ── 5 · Regresión MESA_QR ───────────────────────────────────────────────
  console.log('\n[5] Regresión: MESA_QR sigue funcionando');
  const mesa = await save(PdvMesa, { numero: 7, activo: true, estado: 'DISPONIBLE' });
  const pMesa = await nuevoPedido('MESA_QR', mesa.id);
  const matMesa = await materializarPedidoOnlineEnVenta(ds, pMesa.id, undefined, admin.id);
  const vMesa = await R(Venta).findOne({ where: { id: matMesa.ventaId }, relations: ['mesa'] });
  ok(vMesa?.mesa?.id === mesa.id, 'la venta queda colgada de la mesa', vMesa?.mesa?.id);
  ok(vMesa?.canalOrigen === 'QR_MESA', 'canalOrigen=QR_MESA', vMesa?.canalOrigen);
  ok(await comandaItemsDe(matMesa.ventaId) === 1, 'sigue llegando a la cocina');
  const mesaDespues = await R(PdvMesa).findOneBy({ id: mesa.id });
  ok(mesaDespues?.estado === 'OCUPADO', 'la mesa queda OCUPADO', mesaDespues?.estado);

  // Un segundo pedido a la MISMA mesa cae en la MISMA cuenta.
  const pMesa2 = await nuevoPedido('MESA_QR', mesa.id);
  const matMesa2 = await materializarPedidoOnlineEnVenta(ds, pMesa2.id, undefined, admin.id);
  ok(matMesa2.ventaId === matMesa.ventaId, 'un segundo pedido de la mesa reusa la cuenta abierta');

  // ── 6 · Regresión mostrador ─────────────────────────────────────────────
  console.log('\n[6] Regresión: la venta de mostrador NO va a cocina');
  const vMostrador = await save(Venta, { estado: 'ABIERTA', canalOrigen: 'LOCAL' });
  const viMostrador = await save(VentaItem, {
    venta: { id: vMostrador.id }, producto: { id: producto.id }, cantidad: 1,
    precioCostoUnitario: 0, precioVentaUnitario: 45000, valor: 45000, estado: 'ACTIVO',
  });
  // Mismo hook que dispara el PdV al agregar un item.
  await crearComandaItemsSiCorresponde(ds, viMostrador.id);
  ok(await comandaItemsDe(vMostrador.id) === 0, 'sin mesa, sin comanda y canalOrigen=LOCAL → no genera ComandaItem');

  // ── 6b · DELIVERY crea el registro de reparto ───────────────────────────
  console.log('\n[6b] Un pedido DELIVERY abre su Delivery y arrastra el envío');
  const pDeli2 = await R(PedidoOnline).save(R(PedidoOnline).create({
    numero: `PO-TEST-DELI2-${Date.now() % 100000}`, tipoPedido: 'DELIVERY', estado: 'ACEPTADO',
    canalOrigen: 'WEB', metodoPago: 'EFECTIVO', subtotal: 45000, costoEnvio: 12000, total: 57000,
    nombreCliente: 'ANA', telefonoCliente: '0981222333',
    direccionEntrega: 'AVDA MCAL LOPEZ 1234', referenciaDireccion: 'PORTON NEGRO', notas: 'TOCAR TIMBRE',
  }));
  await save(PedidoOnlineItem, {
    pedido: { id: pDeli2.id }, productoId: producto.id, presentacionId: presentacion.id,
    nombreProducto: 'HAMBURGUESA', cantidad: 1, precioUnitario: 45000, subtotal: 45000,
    personalizacion: JSON.stringify({}),
  });
  const matDeli2 = await materializarPedidoOnlineEnVenta(ds, pDeli2.id, undefined, admin.id);
  const pDeli2Post = await R(PedidoOnline).findOneBy({ id: pDeli2.id });
  ok(!!pDeli2Post?.deliveryId, 'el pedido queda vinculado a un Delivery', pDeli2Post?.deliveryId);

  const vDeli2 = await R(Venta).findOne({ where: { id: matDeli2.ventaId }, relations: ['delivery'] });
  ok(vDeli2?.delivery?.id === pDeli2Post?.deliveryId, 'la venta apunta al mismo Delivery');
  ok(Number(vDeli2?.costoDelivery) === 12000, 'el costo de envío congelado llega a la venta', vDeli2?.costoDelivery);

  const deli = await R(Delivery).findOneBy({ id: pDeli2Post?.deliveryId });
  ok(deli?.estado === 'ABIERTO', 'el Delivery nace ABIERTO', deli?.estado);
  ok((deli?.direccion || '').includes('PORTON NEGRO'), 'la referencia va en la dirección', deli?.direccion);
  ok(deli?.telefono === '0981222333', 'arrastra el teléfono del cliente', deli?.telefono);

  console.log('\n[6c] La bandeja no puede marcar ENTREGADO con la venta sin cobrar');
  await R(PedidoOnline).update({ id: pDeli2.id }, { estado: 'LISTO' } as any);
  const resEntregar: any = await invokeHandler('avanzar-estado-pedido-online', pDeli2.id, 'ENTREGADO');
  ok(resEntregar?.success === false, 'la transición se rechaza', resEntregar);
  ok(resEntregar?.error === 'delivery_rechazo_transicion',
     'y el motivo viene del módulo de delivery, no de una regla duplicada', resEntregar?.error);
  const pDeli2Final = await R(PedidoOnline).findOneBy({ id: pDeli2.id });
  ok(pDeli2Final?.estado === 'LISTO', 'el pedido no avanzó', pDeli2Final?.estado);

  // ── 6d · Delivery cargado a mano por el cajero ──────────────────────────
  console.log('\n[6d] Un delivery del PdV (sin mesa ni comanda) también va a cocina');
  const deliManual = await save(Delivery, {
    nombre: 'CLIENTE TELEFONO', telefono: '0985111222', direccion: 'BARRIO SAN MIGUEL',
    estado: 'ABIERTO', fechaAbierto: new Date(),
  });
  const vDeliManual = await save(Venta, {
    estado: 'ABIERTA', canalOrigen: 'LOCAL', delivery: { id: deliManual.id },
  });
  const viDeliManual = await save(VentaItem, {
    venta: { id: vDeliManual.id }, producto: { id: producto.id }, cantidad: 1,
    precioCostoUnitario: 0, precioVentaUnitario: 45000, valor: 45000, estado: 'ACTIVO',
  });
  await crearComandaItemsSiCorresponde(ds, viDeliManual.id);
  ok(await comandaItemsDe(vDeliManual.id) === 1,
     'un delivery telefónico rutea sus items al sector del producto');

  // ── 7 · Cancelar un pedido YA materializado revierte la venta ───────────
  console.log('\n[7] Cancelar un pedido en preparación revierte la venta');
  const pCancel = await nuevoPedido('DELIVERY');
  const matCancel = await materializarPedidoOnlineEnVenta(ds, pCancel.id, undefined, admin.id);
  const estadoPrevio = (await R(PedidoOnline).findOneBy({ id: pCancel.id }))?.estado;
  ok(estadoPrevio === 'EN_PREPARACION', 'parte de EN_PREPARACION (el camino normal)', estadoPrevio);

  const res: any = await invokeHandler('rechazar-pedido-online', pCancel.id, 'SIN STOCK');
  ok(res?.success === true, 'EN_PREPARACION ahora es cancelable', res?.error);

  const pDespues = await R(PedidoOnline).findOneBy({ id: pCancel.id });
  ok(pDespues?.estado === 'RECHAZADO', 'el pedido queda RECHAZADO', pDespues?.estado);
  ok(pDespues?.motivoRechazo === 'SIN STOCK', 'guarda el motivo en UPPERCASE', pDespues?.motivoRechazo);

  const vCancel = await R(Venta).findOneBy({ id: matCancel.ventaId });
  ok(vCancel?.estado === 'CANCELADA', 'la venta detrás queda CANCELADA', vCancel?.estado);
  const itemsVivos = await R(VentaItem)
    .createQueryBuilder('vi')
    .where('vi.venta_id = :v AND vi.estado = :e', { v: matCancel.ventaId, e: 'ACTIVO' })
    .getCount();
  ok(itemsVivos === 0, 'no quedan items activos en la venta', itemsVivos);

  console.log('\n[8] Un pedido ENTREGADO no se cancela');
  const pEnt = await nuevoPedido('DELIVERY');
  await R(PedidoOnline).update({ id: pEnt.id }, { estado: 'ENTREGADO' } as any);
  const resEnt: any = await invokeHandler('rechazar-pedido-online', pEnt.id, 'TARDE');
  ok(resEnt?.success === false && resEnt?.error === 'estado_no_rechazable',
     'ENTREGADO se rechaza como no cancelable', resEnt);

  // ── 9 · Los tres bloqueantes de la auditoría del diff ───────────────────
  console.log('\n[9] Rechazar un pedido de MESA no puede cancelar la cuenta compartida');
  const mesaComp = await save(PdvMesa, { numero: 12, activo: true, estado: 'DISPONIBLE' });
  const pA = await nuevoPedido('MESA_QR', mesaComp.id);
  const pB = await nuevoPedido('MESA_QR', mesaComp.id);
  const matA = await materializarPedidoOnlineEnVenta(ds, pA.id, undefined, admin.id);
  const matB = await materializarPedidoOnlineEnVenta(ds, pB.id, undefined, admin.id);
  ok(matA.ventaId === matB.ventaId, 'los dos comensales comparten la cuenta de la mesa');

  const rechMesa: any = await invokeHandler('rechazar-pedido-online', pA.id, 'SE ARREPINTIO');
  ok(rechMesa?.success === false && rechMesa?.error === 'mesa_ya_materializada',
     'rechazar uno se corta en vez de revertir la cuenta entera', rechMesa);
  const ventaComp = await R(Venta).findOneBy({ id: matA.ventaId });
  ok(ventaComp?.estado === 'ABIERTA', 'la cuenta de la mesa sigue viva', ventaComp?.estado);
  const itemsComp = await R(VentaItem)
    .createQueryBuilder('vi')
    .where('vi.venta_id = :v AND vi.estado = :e', { v: matA.ventaId, e: 'ACTIVO' })
    .getCount();
  ok(itemsComp === 2, 'los platos de los dos comensales siguen activos', itemsComp);

  console.log('\n[10] Revertir una venta ya cobrada exige el permiso reservado');
  const pCobrado = await nuevoPedido('DELIVERY');
  const matCobrado = await materializarPedidoOnlineEnVenta(ds, pCobrado.id, undefined, admin.id);
  await R(Venta).update({ id: matCobrado.ventaId }, { estado: 'CONCLUIDA' } as any);
  let bloqueado = false;
  try {
    await invokeHandler('rechazar-pedido-online', pCobrado.id, 'TARDE');
  } catch (e: any) {
    bloqueado = e?.code === 'FORBIDDEN' && /VENTAS_DELIVERY_CANCELAR_COBRADO/.test(String(e?.message));
  }
  ok(bloqueado, 'sin VENTAS_DELIVERY_CANCELAR_COBRADO no se puede revertir un cobro');

  console.log('\n[11] Un retiro materializado es cobrable desde la bandeja');
  const pRetiro = await nuevoPedido('PICKUP');
  const matRetiro = await materializarPedidoOnlineEnVenta(ds, pRetiro.id, undefined, admin.id);
  const retiros: any = await invokeHandler('get-retiros-online-en-curso');
  const encontrado = (retiros || []).find((r: any) => r.id === pRetiro.id);
  ok(!!encontrado, 'el retiro aparece en la lista de retiros en curso');
  ok(encontrado?.ventaId === matRetiro.ventaId, 'con su venta, que es lo que se cobra');
  ok(encontrado?.cobrada === false, 'y marcado como sin cobrar', encontrado?.cobrada);

  await R(Venta).update({ id: matRetiro.ventaId }, { estado: 'CONCLUIDA' } as any);
  const retiros2: any = await invokeHandler('get-retiros-online-en-curso');
  ok(retiros2.find((r: any) => r.id === pRetiro.id)?.cobrada === true,
     'una vez cobrada la venta, el retiro queda marcado COBRADO');

  await ds.destroy();
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
