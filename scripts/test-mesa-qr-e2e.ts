/**
 * E2E: canal MESA_QR (pedidos en mesa por QR autoservicio).
 *
 * Ejercita el código REAL contra SQLite (migraciones incluidas):
 *  - matcher de red LAN (`ipEnRangosLan`): IPv4/IPv6/CIDR/mapped/basura,
 *  - materialización pedido→venta (`materializarPedidoOnlineEnVenta`): split de
 *    precios (base vs adicionales), observaciones/nota libre → VentaItemObservacion,
 *    idempotencia, y CONCURRENCIA (dos pedidos misma mesa → una sola venta),
 *  - `crear-pedido-online` rama MESA_QR: gates (permiteMesa, mesa habilitada,
 *    token inválido, nombre, LAN) + happy path.
 *
 * Uso: npm run test:mesa-qr
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { ipEnRangosLan } from '../electron/utils/ip-lan.util';
import { registerVentasHandlers, materializarPedidoOnlineEnVenta } from '../electron/handlers/ventas.handler';
import { registerPedidosOnlinePedidosHandlers } from '../electron/handlers/pedidos-online-pedidos.handler';
import { registerPedidosOnlineConfigHandlers } from '../electron/handlers/pedidos-online-config.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  // ───────────────────────── Parte A: matcher LAN (puro) ─────────────────────
  console.log('\n[A] ipEnRangosLan (matcher de red)');
  ok(ipEnRangosLan('192.168.1.5', '192.168.0.0/16') === true, 'IPv4 dentro de CIDR');
  ok(ipEnRangosLan('200.1.2.3', '192.168.0.0/16') === false, 'IPv4 fuera de CIDR');
  ok(ipEnRangosLan('190.10.20.30', '190.10.20.30') === true, 'IPv4 exacta (IP pública del local)');
  ok(ipEnRangosLan('::ffff:192.168.1.5', '192.168.0.0/16') === true, 'IPv4-mapped IPv6');
  ok(ipEnRangosLan('2800:abc:1::5', '2800:abc:1::/48') === true, 'IPv6 dentro de CIDR');
  ok(ipEnRangosLan('2800:abc:2::5', '2800:abc:1::/48') === false, 'IPv6 fuera de CIDR');
  ok(ipEnRangosLan('fd12:3456::1') === true, 'IPv6 ULA cae en rangos privados default');
  ok(ipEnRangosLan('2800:abc::1') === false, 'IPv6 público sin rango → rechazado');
  ok(ipEnRangosLan('') === false, 'IP vacía → false');
  ok(ipEnRangosLan('basura', '192.168.0.0/16') === false, 'IP inválida → false');

  // ───────────────────────── Setup BD ────────────────────────────────────────
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-mesa-qr.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('\n[setup] Migraciones OK.');

  const E = (n: string) => require(`../src/app/database/entities/${n}`);
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
  const { PrecioCosto } = E('productos/precio-costo.entity');
  const { Observacion } = E('productos/observacion.entity');
  const { Adicional } = E('productos/adicional.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { VentaItemObservacion } = E('ventas/venta-item-observacion.entity');
  const { VentaItemAdicional } = E('ventas/venta-item-adicional.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { PedidoOnlineItem } = E('pedidos-online/pedido-online-item.entity');
  const { TiendaOnlineConfig } = E('pedidos-online/tienda-online-config.entity');
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data));

  // Seed base
  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const perm = await save(Permission, { codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  await save(RolePermission, { role, permission: perm });
  await save(UsuarioRole, { usuario: admin, role });
  const moneda = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const dispositivo = await save(Dispositivo, { nombre: 'CAJA1', activo: true });
  const conteo = await save(Conteo, {});
  const caja = await save(Caja, { estado: 'ABIERTO', fechaApertura: new Date(), dispositivo, conteoApertura: conteo, activo: true });

  const familia = await save(Familia, { nombre: 'GENERAL', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'GENERAL', activo: true, familia });
  const producto = await save(Producto, {
    nombre: 'GASEOSA', tipo: 'RETAIL', activo: true, esVendible: true,
    disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia,
  });
  const presentacion = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto });
  await save(PrecioVenta, { valor: 10000, principal: true, activo: true, moneda, tipoPrecio, presentacion });
  await save(PrecioCosto, { valor: 6000, activo: true, moneda, producto, fuente: 'MANUAL', fecha: new Date() });
  const obsPredef = await save(Observacion, { descripcion: 'SIN HIELO', activo: true });
  const adicional = await save(Adicional, { nombre: 'EXTRA LIMON', activo: true });

  const cfgRepo = R(TiendaOnlineConfig);
  const cfg = await cfgRepo.save(cfgRepo.create({
    activa: true, permitePickup: true, permiteDelivery: true,
    permiteMesa: true, requiereLanMesa: false, prepTimeMinutos: 30, montoMinimoPedido: 0,
  }));

  registerVentasHandlers(ds, () => admin);
  registerPedidosOnlineConfigHandlers(ds, () => admin);
  registerPedidosOnlinePedidosHandlers(ds);

  // helper: crea un PedidoOnline de mesa con 1 item simple (adicional + obs + nota)
  let numeroSeq = 0;
  async function crearPedidoMesa(mesaId: number): Promise<number> {
    const pedido = await save(PedidoOnline, {
      numero: `PO-${String(++numeroSeq).padStart(6, '0')}`,
      mesaId, tipoPedido: 'MESA_QR', estado: 'ACEPTADO', canalOrigen: 'QR_MESA', metodoPago: 'EFECTIVO',
      nombreCliente: 'JUAN', subtotal: 12000, costoEnvio: 0, total: 12000,
    });
    await save(PedidoOnlineItem, {
      pedido, productoId: producto.id, presentacionId: presentacion.id,
      nombreProducto: 'GASEOSA', nombrePresentacion: 'UNIDAD', cantidad: 1,
      precioUnitario: 12000, subtotal: 12000, // 10000 base + 2000 adicional
      personalizacion: JSON.stringify({
        opcion: { label: 'UNIDAD', tipo: 'PRESENTACION' },
        sabores: null,
        adicionales: [{ id: adicional.id, nombre: 'EXTRA LIMON', precio: 2000 }],
        observaciones: ['SIN HIELO'],
        notaLibre: 'BIEN FRIA',
      }),
    });
    return pedido.id;
  }

  // ───────────── Parte B: materialización (split precios / obs / idempotencia) ─
  console.log('\n[B] materializarPedidoOnlineEnVenta');
  const mesaA = await save(PdvMesa, { numero: 1, activo: true, estado: 'DISPONIBLE', autoservicioActivo: true, qrToken: 'tok-A' });
  const pedidoAId = await crearPedidoMesa(mesaA.id);
  const res1 = await materializarPedidoOnlineEnVenta(ds, pedidoAId);
  ok(!!res1.ventaId, 'materializa: devuelve ventaId', res1);
  ok(res1.itemsCreados === 1, 'materializa: 1 item creado', res1);

  const ventasMesaA = await R(Venta).find({ where: { mesa: { id: mesaA.id }, estado: 'ABIERTA' } });
  ok(ventasMesaA.length === 1, 'una sola venta ABIERTA para la mesa');
  const items = await R(VentaItem).find({ where: { venta: { id: res1.ventaId } } });
  ok(items.length === 1, 'venta tiene 1 VentaItem');
  const it = items[0];
  ok(Number(it.precioVentaUnitario) === 10000, 'precioVentaUnitario = base (sin adicionales)', it.precioVentaUnitario);
  ok(Number(it.precioAdicionales) === 2000, 'precioAdicionales = suma de adicionales', it.precioAdicionales);
  ok(Number(it.precioCostoUnitario) === 6000, 'precioCostoUnitario tomado de PrecioCosto', it.precioCostoUnitario);

  const adics = await R(VentaItemAdicional).find({ where: { ventaItem: { id: it.id } } });
  ok(adics.length === 1 && Number(adics[0].precioCobrado) === 2000, 'VentaItemAdicional creado con precioCobrado');

  const obsRows = await R(VentaItemObservacion).find({ where: { ventaItem: { id: it.id } }, relations: ['observacion'] });
  const conObsPredef = obsRows.some((o: any) => o.observacion?.id === obsPredef.id);
  const conNotaLibre = obsRows.some((o: any) => (o.observacionLibre || '').includes('BIEN FRIA'));
  ok(conObsPredef, 'observación predefinida mapeada por texto');
  ok(conNotaLibre, 'nota libre guardada en observacionLibre (sentinel)');

  const pedidoA = await R(PedidoOnline).findOne({ where: { id: pedidoAId } });
  ok(pedidoA?.ventaId === res1.ventaId && pedidoA?.estado === 'EN_PREPARACION', 'pedido vinculado + EN_PREPARACION');
  const mesaAdb = await R(PdvMesa).findOne({ where: { id: mesaA.id } });
  ok(mesaAdb?.estado === 'OCUPADO', 'mesa marcada OCUPADO');

  // Idempotencia
  const res2 = await materializarPedidoOnlineEnVenta(ds, pedidoAId);
  ok(res2.yaMaterializado === true && res2.ventaId === res1.ventaId, 'idempotente: segunda llamada no duplica');
  const itemsPost = await R(VentaItem).find({ where: { venta: { id: res1.ventaId } } });
  ok(itemsPost.length === 1, 'idempotente: no se agregaron items');

  // ───────────── Concurrencia: 2 pedidos misma mesa → 1 sola venta ────────────
  console.log('\n[C] Concurrencia (lock por mesa)');
  const mesaB = await save(PdvMesa, { numero: 2, activo: true, estado: 'DISPONIBLE', autoservicioActivo: true, qrToken: 'tok-B' });
  const p1 = await crearPedidoMesa(mesaB.id);
  const p2 = await crearPedidoMesa(mesaB.id);
  const [r1, r2] = await Promise.all([
    materializarPedidoOnlineEnVenta(ds, p1),
    materializarPedidoOnlineEnVenta(ds, p2),
  ]);
  const ventasMesaB = await R(Venta).find({ where: { mesa: { id: mesaB.id }, estado: 'ABIERTA' } });
  ok(ventasMesaB.length === 1, 'concurrencia: UNA sola venta abierta para la mesa', { r1: r1.ventaId, r2: r2.ventaId });
  ok(r1.ventaId === r2.ventaId, 'ambos pedidos caen en la misma venta');
  const itemsB = await R(VentaItem).find({ where: { venta: { id: r1.ventaId } } });
  ok(itemsB.length === 2, 'la venta de la mesa tiene los items de ambos pedidos', itemsB.length);

  // ───────────── Parte D: crear-pedido-online rama MESA_QR (gates) ────────────
  console.log('\n[D] crear-pedido-online (gates MESA_QR)');
  const mesaC = await save(PdvMesa, { numero: 3, activo: true, estado: 'DISPONIBLE', autoservicioActivo: true, qrToken: 'tok-C' });
  const baseItems = [{ productoId: producto.id, presentacionId: presentacion.id, cantidad: 1 }];
  const call = (data: any, ctx: any = {}) =>
    invokeHandlerWithContext('crear-pedido-online', { customerId: null, clientIp: '127.0.0.1', ...ctx }, data);

  // token inválido
  let r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'no-existe', nombreCliente: 'ANA', items: baseItems });
  ok(r?.error === 'mesa_invalida', 'token inválido → mesa_invalida', r);
  // falta nombre
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', items: baseItems });
  ok(r?.error === 'falta_nombre', 'sin nombre → falta_nombre', r);
  // mesa no habilitada
  await R(PdvMesa).update(mesaC.id, { autoservicioActivo: false });
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems });
  ok(r?.error === 'mesa_no_habilitada', 'mesa deshabilitada → mesa_no_habilitada', r);
  await R(PdvMesa).update(mesaC.id, { autoservicioActivo: true });
  // permiteMesa off
  await cfgRepo.update(cfg.id, { permiteMesa: false });
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems });
  ok(r?.error === 'mesa_no_disponible', 'permiteMesa off → mesa_no_disponible', r);
  await cfgRepo.update(cfg.id, { permiteMesa: true });
  // LAN: requiere red del local, IP fuera de rango
  await cfgRepo.update(cfg.id, { requiereLanMesa: true, rangoLanMesa: '190.1.2.3' });
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems }, { clientIp: '8.8.8.8' });
  ok(r?.error === 'fuera_de_red_local', 'IP fuera de la red → fuera_de_red_local', r);
  // LAN: IP permitida
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems }, { clientIp: '190.1.2.3' });
  ok(r?.success === true, 'IP permitida → pedido creado', r);
  ok(!!r?.ventaId, 'pedido MESA_QR se materializa (auto a cocina)', r);
  await cfgRepo.update(cfg.id, { requiereLanMesa: false });

  // get-mesa-online-por-token
  const mctx = await invokeHandlerWithContext('get-mesa-online-por-token', { clientIp: '127.0.0.1' }, 'tok-C');
  ok(mctx?.success && mctx?.numero === 3 && mctx?.habilitada === true, 'get-mesa-online-por-token devuelve contexto', mctx);

  await ds.destroy();

  console.log(`\n${failed === 0 ? '✅' : '❌'} MESA_QR: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
