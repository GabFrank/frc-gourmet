/**
 * E2E de la zona de entrega en los repartos que nacen de la tienda online.
 *
 * `materializarPedidoOnlineEnVenta` creaba el `Delivery` con el costo congelado
 * del pedido pero **sin la zona**: quedaba sólo en `pedidos_online`, y del lado
 * del PdV el reparto figuraba sin zona. Mientras nadie agrupara por zona no se
 * notaba; en cuanto los informes cuentan envíos por zona, todo lo que entró por
 * la web cae en "SIN ZONA".
 *
 * Este test fija las dos mitades del arreglo:
 *
 *  1 · el alta sella la zona (y NO recalcula el costo con la tarifa actual: el
 *      cliente vio la vieja en el checkout y ésa es la que se cobra);
 *  2 · la migración `BackfillZonaDeliveryPedidosOnline` recupera los repartos
 *      que ya se habían creado sin zona, sin pisar los que sí la tienen.
 *
 * Uso: npm run test:zona-delivery-online
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { materializarPedidoOnlineEnVenta } from '../electron/handlers/ventas.handler';
import { BackfillZonaDeliveryPedidosOnline1787877249492 } from '../src/app/database/migrations/1787877249492-BackfillZonaDeliveryPedidosOnline';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-zona-delivery-online.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[zona-delivery] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { PrecioDelivery } = E('ventas/precio-delivery.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Venta } = E('ventas/venta.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { ZonaDelivery } = E('pedidos-online/zona-delivery.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const cajero: any = await save(Usuario, { nickname: 'cajero', password: 'x', activo: true });
  const dispositivo: any = await save(Dispositivo, { nombre: 'CAJA-TEST', activo: true });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(), createdBy: cajero, dispositivo,
    conteoApertura: await save(Conteo, {}),
  });

  // La tarifa de la zona (15.000) difiere a propósito del costo congelado en el
  // pedido (12.000): es lo que distingue "sellar la zona" de "recotizar".
  const precioCentro: any = await save(PrecioDelivery, { descripcion: 'CENTRO', valor: 15000, activo: true });
  const zonaCentro: any = await save(ZonaDelivery, {
    nombre: 'CENTRO', tarifa: 15000, montoMinimo: 0, activa: true, precioDelivery: precioCentro,
  });
  // Zona anterior a la unificación de tarifas: no tiene `precioDelivery`, así
  // que no hay nada que sellar y el alta no puede inventarlo.
  const zonaVieja: any = await save(ZonaDelivery, {
    nombre: 'BARRIO VIEJO', tarifa: 9000, montoMinimo: 0, activa: true,
  });

  let n = 0;
  const nuevoPedido = (data: any) => save(PedidoOnline, {
    numero: `P-${++n}`, estado: 'ACEPTADO', canalOrigen: 'WEB', metodoPago: 'EFECTIVO',
    subtotal: 50000, total: 62000, ...data,
  });

  console.log('\n[zona-delivery] === ALTA DESDE LA TIENDA ONLINE ===');

  // 1 · DELIVERY con zona que tiene tarifa compartida → sella la zona.
  const pDelivery: any = await nuevoPedido({
    tipoPedido: 'DELIVERY', zonaDelivery: zonaCentro, direccionEntrega: 'Calle 1', costoEnvio: 12000,
  });
  const mat1 = await materializarPedidoOnlineEnVenta(ds, pDelivery.id, { cajaId: caja.id }, cajero.id);
  const venta1: any = await ds.getRepository(Venta).findOne({
    where: { id: mat1.ventaId }, relations: ['delivery', 'delivery.precioDelivery'],
  });
  ok(venta1?.delivery?.precioDelivery?.id === precioCentro.id,
    'el delivery web queda con la zona del pedido', venta1?.delivery?.precioDelivery?.id);
  ok(Number(venta1?.costoDelivery) === 12000,
    'el costo sigue siendo el congelado del pedido, no la tarifa vigente', venta1?.costoDelivery);

  // 2 · PICKUP → RETIRO sin zona, aunque el pedido traiga una cargada.
  const pRetiro: any = await nuevoPedido({
    tipoPedido: 'PICKUP', zonaDelivery: zonaCentro, costoEnvio: 0,
  });
  const mat2 = await materializarPedidoOnlineEnVenta(ds, pRetiro.id, { cajaId: caja.id }, cajero.id);
  const venta2: any = await ds.getRepository(Venta).findOne({
    where: { id: mat2.ventaId }, relations: ['delivery', 'delivery.precioDelivery'],
  });
  ok(venta2?.delivery?.modo === 'RETIRO', 'PICKUP entra como RETIRO', venta2?.delivery?.modo);
  ok(!venta2?.delivery?.precioDelivery,
    'un retiro no sella zona aunque el pedido la traiga', venta2?.delivery?.precioDelivery?.id);

  // 3 · Zona sin tarifa compartida → sin zona, y sin reventar.
  const pSinTarifa: any = await nuevoPedido({
    tipoPedido: 'DELIVERY', zonaDelivery: zonaVieja, direccionEntrega: 'Calle 2', costoEnvio: 9000,
  });
  const mat3 = await materializarPedidoOnlineEnVenta(ds, pSinTarifa.id, { cajaId: caja.id }, cajero.id);
  const venta3: any = await ds.getRepository(Venta).findOne({
    where: { id: mat3.ventaId }, relations: ['delivery', 'delivery.precioDelivery'],
  });
  ok(!venta3?.delivery?.precioDelivery,
    'zona sin tarifa compartida → delivery sin zona', venta3?.delivery?.precioDelivery?.id);
  ok(Number(venta3?.costoDelivery) === 9000,
    'el costo congelado se respeta igual sin zona', venta3?.costoDelivery);

  console.log('\n[zona-delivery] === BACKFILL DE LOS REPARTOS VIEJOS ===');

  // Reproduce el estado que dejaba el alta con el bug: `Delivery` sin zona,
  // vinculado a un pedido que sí sabe en qué zona era.
  const crearLegacy = async (opts: { modo: string; zona: any; precioPrevio?: any }) => {
    const delivery: any = await save(Delivery, {
      nombre: 'CLIENTE WEB', telefono: '0981', estado: 'ABIERTO', modo: opts.modo,
      fechaAbierto: new Date(), cobroAnticipado: false,
      precioDelivery: opts.precioPrevio ?? undefined,
    });
    const venta: any = await save(Venta, {
      estado: 'ABIERTA', caja, delivery, canalOrigen: 'WEB', costoDelivery: 12000,
    });
    const pedido: any = await nuevoPedido({
      tipoPedido: opts.modo === 'RETIRO' ? 'PICKUP' : 'DELIVERY',
      zonaDelivery: opts.zona, costoEnvio: 12000, ventaId: venta.id, deliveryId: delivery.id,
    });
    return { delivery, venta, pedido };
  };

  const legacySinZona = await crearLegacy({ modo: 'DELIVERY', zona: zonaCentro });
  const legacyZonaVieja = await crearLegacy({ modo: 'DELIVERY', zona: zonaVieja });
  const legacyRetiro = await crearLegacy({ modo: 'RETIRO', zona: zonaCentro });
  // Un reparto al que el cajero ya le puso zona a mano: el backfill no lo toca.
  const precioOtro: any = await save(PrecioDelivery, { descripcion: 'VILLA MORRA', valor: 20000, activo: true });
  const yaConZona = await crearLegacy({ modo: 'DELIVERY', zona: zonaCentro, precioPrevio: precioOtro });

  const qr = ds.createQueryRunner();
  await qr.connect();
  await new BackfillZonaDeliveryPedidosOnline1787877249492().up(qr);
  await qr.release();

  const zonaDe = async (id: number): Promise<number | null> => {
    const d: any = await ds.getRepository(Delivery).findOne({ where: { id }, relations: ['precioDelivery'] });
    return d?.precioDelivery?.id ?? null;
  };

  ok(await zonaDe(legacySinZona.delivery.id) === precioCentro.id,
    'el backfill recupera la zona del reparto web sin zona', await zonaDe(legacySinZona.delivery.id));
  ok(await zonaDe(legacyZonaVieja.delivery.id) === null,
    'una zona sin tarifa compartida sigue sin zona tras el backfill');
  ok(await zonaDe(legacyRetiro.delivery.id) === null,
    'el backfill no le inventa zona a un retiro');
  ok(await zonaDe(yaConZona.delivery.id) === precioOtro.id,
    'el backfill no pisa la zona que ya tenía el reparto', await zonaDe(yaConZona.delivery.id));

  // Correr dos veces no cambia nada: la migración es reejecutable sin daño.
  const qr2 = ds.createQueryRunner();
  await qr2.connect();
  await new BackfillZonaDeliveryPedidosOnline1787877249492().up(qr2);
  await qr2.release();
  ok(await zonaDe(legacySinZona.delivery.id) === precioCentro.id,
    'reejecutar el backfill es idempotente');

  await ds.destroy();

  console.log(`\n[zona-delivery] ${passed} OK, ${failed} FALLAN`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
