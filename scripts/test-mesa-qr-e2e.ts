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
import { registerMesaQrHandlers } from '../electron/handlers/mesa-qr.handler';

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
  ok(ipEnRangosLan('45.6.7.8', '1.2.3.4, 45.6.7.0/24, 9.9.9.9') === true, 'lista separada por coma (matchea la 2ª)');
  ok(ipEnRangosLan('10.0.0.1', ' 192.168.0.0/16 , 10.0.0.0/8 ') === true, 'lista con espacios');
  ok(ipEnRangosLan('8.8.8.8', '0.0.0.0/0') === true, 'CIDR /0 acepta todo');
  ok(ipEnRangosLan('190.1.2.3', '190.1.2.3/32') === true, 'CIDR /32 = IP exacta');
  ok(ipEnRangosLan('190.1.2.4', '190.1.2.3/32') === false, 'CIDR /32 rechaza vecina');
  ok(ipEnRangosLan('127.0.0.1') === true, 'loopback IPv4 en default');
  ok(ipEnRangosLan('::1') === true, 'loopback IPv6 en default');
  ok(ipEnRangosLan('192.168.1.1', '2800:abc::/32') === false, 'familias mezcladas (IPv4 vs rango IPv6) → false');
  ok(ipEnRangosLan('2800:abc::1', '2800:abc::/32') === true, 'IPv6 /32');

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
  const { Receta } = E('productos/receta.entity');
  const { Sabor } = E('productos/sabor.entity');
  const { RecetaPresentacion } = E('productos/receta-presentacion.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { VentaItemObservacion } = E('ventas/venta-item-observacion.entity');
  const { VentaItemAdicional } = E('ventas/venta-item-adicional.entity');
  const { VentaItemSabor } = E('ventas/venta-item-sabor.entity');
  const { PedidoOnline } = E('pedidos-online/pedido-online.entity');
  const { PedidoOnlineItem } = E('pedidos-online/pedido-online-item.entity');
  const { TiendaOnlineConfig } = E('pedidos-online/tienda-online-config.entity');
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data));

  // Seed base
  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  // El módulo de pedidos online dejó de usar `VENTAS_PDV` para todo.
  for (const codigo of ['VENTAS_PDV', 'PEDIDOS_ONLINE_VER', 'PEDIDOS_ONLINE_GESTIONAR', 'PEDIDOS_ONLINE_CONFIGURAR']) {
    const permiso = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role, permission: permiso });
  }
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

  // Cadena de pizza (variación): producto ELABORADO_CON_VARIACION + tamaño + sabor
  // + receta + RecetaPresentacion (con costo_calculado, para el costo del item).
  const pizza = await save(Producto, {
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true,
    disponibleOnline: true, pausadoOnline: false, iva: 10, subfamilia,
  });
  const presGrande = await save(Presentacion, { nombre: 'GRANDE', cantidad: 1, principal: true, producto: pizza });
  const saborMuzza = await save(Sabor, { nombre: 'MUZZARELLA', categoria: 'PIZZA', activo: true, producto_id: pizza.id });
  const recetaPizza = await save(Receta, { nombre: 'PIZZA GRANDE MUZZARELLA', rendimiento: 1, costoCalculado: 0, activo: true });
  const rp = await save(RecetaPresentacion, {
    nombre_generado: 'PIZZA GRANDE MUZZARELLA', costo_calculado: 18000, activo: true,
    receta: recetaPizza, presentacion: presGrande, sabor: saborMuzza,
  });

  const cfgRepo = R(TiendaOnlineConfig);
  const cfg = await cfgRepo.save(cfgRepo.create({
    activa: true, permitePickup: true, permiteDelivery: true,
    permiteMesa: true, requiereLanMesa: false, prepTimeMinutos: 30, montoMinimoPedido: 0,
  }));

  registerVentasHandlers(ds, () => admin);
  registerPedidosOnlineConfigHandlers(ds, () => admin);
  registerPedidosOnlinePedidosHandlers(ds);
  registerMesaQrHandlers(ds, () => admin);

  // helper: crea un PedidoOnline de mesa con 1 item simple (adicional + obs + nota)
  let numeroSeq = 0;
  async function crearPedidoMesa(mesaId: number): Promise<number> {
    const pedido = await save(PedidoOnline, {
      numero: `T-${String(++numeroSeq).padStart(6, '0')}`,
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
  // LAN default (requiereLanMesa true, sin rango) desde localhost → rango privado
  await cfgRepo.update(cfg.id, { requiereLanMesa: true, rangoLanMesa: null });
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems }, { clientIp: '127.0.0.1' });
  ok(r?.success === true, 'LAN default: localhost (rango privado) → permitido', r);
  await cfgRepo.update(cfg.id, { requiereLanMesa: false });
  // sin items
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: [] });
  ok(r?.error === 'pedido_sin_items', 'sin items → pedido_sin_items', r);
  // tienda cerrada
  await cfgRepo.update(cfg.id, { activa: false });
  r = await call({ tipoPedido: 'MESA_QR', mesaToken: 'tok-C', nombreCliente: 'ANA', items: baseItems });
  ok(r?.error === 'tienda_cerrada', 'tienda inactiva → tienda_cerrada', r);
  await cfgRepo.update(cfg.id, { activa: true });
  // PICKUP sin cliente autenticado → no_autenticado (no aplica el invitado de mesa)
  r = await call({ tipoPedido: 'PICKUP', items: baseItems }, { customerId: null });
  ok(r?.error === 'no_autenticado', 'PICKUP sin cliente → no_autenticado', r);

  // get-mesa-online-por-token
  const mctx = await invokeHandlerWithContext('get-mesa-online-por-token', { clientIp: '127.0.0.1' }, 'tok-C');
  ok(mctx?.success && mctx?.numero === 3 && mctx?.habilitada === true, 'get-mesa-online-por-token devuelve contexto', mctx);

  // ───────────── Parte E: materialización de pizza (sabores + costo) ──────────
  console.log('\n[E] materialización pizza (sabores + costo)');
  const mesaP = await save(PdvMesa, { numero: 10, activo: true, estado: 'DISPONIBLE', autoservicioActivo: true, qrToken: 'tok-P' });
  const pedidoPizza = await save(PedidoOnline, {
    numero: `T-${String(++numeroSeq).padStart(6, '0')}`, mesaId: mesaP.id, tipoPedido: 'MESA_QR', estado: 'ACEPTADO',
    canalOrigen: 'QR_MESA', metodoPago: 'EFECTIVO', nombreCliente: 'LU', subtotal: 40000, costoEnvio: 0, total: 40000,
  });
  await save(PedidoOnlineItem, {
    pedido: pedidoPizza, productoId: pizza.id, presentacionId: presGrande.id,
    nombreProducto: 'PIZZA', nombrePresentacion: 'GRANDE', cantidad: 1, precioUnitario: 40000, subtotal: 40000,
    personalizacion: JSON.stringify({
      opcion: { label: 'GRANDE · MUZZARELLA', tipo: 'PIZZA' },
      sabores: [{ saborId: saborMuzza.id, nombre: 'MUZZARELLA', proporcion: 1, recetaPresentacionId: rp.id, precioReferencia: 40000 }],
      adicionales: [], observaciones: [], notaLibre: undefined,
    }),
  });
  const resP = await materializarPedidoOnlineEnVenta(ds, pedidoPizza.id);
  ok(!!resP.ventaId, 'pizza: materializa', resP);
  const itemsP = await R(VentaItem).find({ where: { venta: { id: resP.ventaId } }, relations: ['recetaPresentacion'] });
  ok(itemsP.length === 1, 'pizza: 1 VentaItem');
  ok(itemsP[0].recetaPresentacion?.id === rp.id, 'pizza: recetaPresentacion principal seteada');
  ok(Number(itemsP[0].cantidadSabores) === 1, 'pizza: cantidadSabores = 1');
  ok((itemsP[0].ensambladoDescripcion || '').includes('MUZZARELLA'), 'pizza: ensambladoDescripcion');
  ok(Number(itemsP[0].precioCostoUnitario) === 18000, 'pizza: costo desde RecetaPresentacion.costo_calculado', itemsP[0].precioCostoUnitario);
  const saboresRows = await R(VentaItemSabor).find({ where: { ventaItem: { id: itemsP[0].id } } });
  ok(saboresRows.length === 1, 'pizza: VentaItemSabor creado');
  ok(Number(saboresRows[0].costoReferencia) === 18000, 'pizza: costoReferencia del sabor');

  // ───────────── Parte F: handlers de QR de mesa ──────────────────────────────
  console.log('\n[F] handlers de QR de mesa');
  const mesaQ = await save(PdvMesa, { numero: 20, activo: true, estado: 'DISPONIBLE', autoservicioActivo: false });
  const g1 = await invokeHandlerWithContext('generar-qr-mesa', {}, mesaQ.id, { baseUrl: 'https://app.frc-gourmet.com' });
  ok(!!g1?.token && g1.urlAbsoluta === true && String(g1.qr || '').startsWith('data:image'), 'generar-qr-mesa: token + qr + urlAbsoluta');
  ok(String(g1.url).startsWith('https://') && g1.url.includes('/tienda?mesa='), 'generar-qr-mesa: url absoluta a /tienda');
  const g2 = await invokeHandlerWithContext('generar-qr-mesa', {}, mesaQ.id, { baseUrl: '' });
  ok(g2.urlAbsoluta === false && g2.qr === '', 'generar-qr-mesa: baseUrl vacío → sin qr');
  ok(g2.token === g1.token, 'generar-qr-mesa: token estable sin rotar');
  const g3 = await invokeHandlerWithContext('generar-qr-mesa', {}, mesaQ.id, { baseUrl: 'https://x.com', rotar: true });
  ok(g3.token !== g1.token, 'generar-qr-mesa: rotar genera token nuevo');
  const listaQr = await invokeHandlerWithContext('get-qr-mesas', {}, { baseUrl: 'https://x.com' });
  ok(Array.isArray(listaQr) && listaQr.length >= 1 && listaQr.every((m: any) => !!m.token), 'get-qr-mesas: todas con token');
  await invokeHandlerWithContext('set-autoservicio-mesa', {}, mesaQ.id, true);
  const mq = await R(PdvMesa).findOne({ where: { id: mesaQ.id } });
  ok(mq?.autoservicioActivo === true, 'set-autoservicio-mesa: habilita');
  const ctxQ = await invokeHandlerWithContext('get-mesa-online-por-token', { clientIp: '127.0.0.1' }, g3.token);
  ok(ctxQ?.success && ctxQ?.habilitada === true, 'get-mesa-online-por-token refleja habilitación');
  await invokeHandlerWithContext('set-autoservicio-mesa', {}, mesaQ.id, false);
  const ctxQ2 = await invokeHandlerWithContext('get-mesa-online-por-token', { clientIp: '127.0.0.1' }, g3.token);
  ok(ctxQ2?.habilitada === false, 'set-autoservicio-mesa: deshabilita (reflejado)');

  // ───────────── Parte G: config de tienda (round-trip MESA_QR) ───────────────
  console.log('\n[G] config de tienda (round-trip)');
  await invokeHandlerWithContext('update-tienda-online-config', {}, { permiteMesa: true, requiereLanMesa: true, rangoLanMesa: '190.1.2.3, 10.0.0.0/8' });
  const cfgGet = await invokeHandlerWithContext('get-tienda-online-config', {});
  ok(cfgGet.permiteMesa === true && cfgGet.requiereLanMesa === true && cfgGet.rangoLanMesa === '190.1.2.3, 10.0.0.0/8', 'update/get config MESA_QR persiste');
  const cfgPub = await invokeHandlerWithContext('get-tienda-online-config-public', {});
  ok(cfgPub.permiteMesa === true, 'config pública expone permiteMesa');
  await invokeHandlerWithContext('update-tienda-online-config', {}, { requiereLanMesa: false });

  // ───────────── Parte H: materialización edge cases ──────────────────────────
  console.log('\n[H] materialización: edge cases');
  const mesaRe = await save(PdvMesa, { numero: 30, activo: true, estado: 'OCUPADO', autoservicioActivo: true, qrToken: 'tok-Re' });
  const ventaExistente = await save(Venta, { estado: 'ABIERTA', mesa: mesaRe, caja });
  const pedidoRe = await crearPedidoMesa(mesaRe.id);
  const resRe = await materializarPedidoOnlineEnVenta(ds, pedidoRe);
  ok(resRe.ventaId === ventaExistente.id, 'reusa la venta ABIERTA existente de la mesa (no crea otra)', { got: resRe.ventaId, exp: ventaExistente.id });
  const ventasRe = await R(Venta).find({ where: { mesa: { id: mesaRe.id }, estado: 'ABIERTA' } });
  ok(ventasRe.length === 1, 'sigue habiendo una sola venta abierta');

  // Un pedido sin mesa YA NO es un error: desde que PICKUP/DELIVERY se
  // materializan, abre su propia venta sin mesa marcada canalOrigen=WEB. Lo que
  // acá importa es que ese camino no toque ninguna mesa.
  const pedidoSinMesa = await save(PedidoOnline, { numero: `T-${String(++numeroSeq).padStart(6, '0')}`, tipoPedido: 'PICKUP', estado: 'RECIBIDO', canalOrigen: 'WEB', metodoPago: 'EFECTIVO', subtotal: 0, costoEnvio: 0, total: 0 });
  const resSinMesa = await materializarPedidoOnlineEnVenta(ds, pedidoSinMesa.id);
  ok(!!resSinMesa.ventaId, 'pedido sin mesaId → abre su propia venta');
  const ventaSinMesa = await R(Venta).findOne({ where: { id: resSinMesa.ventaId }, relations: ['mesa'] });
  ok(!ventaSinMesa?.mesa, 'esa venta no queda colgada de ninguna mesa');
  ok(ventaSinMesa?.canalOrigen === 'WEB', 'y queda marcada canalOrigen=WEB', ventaSinMesa?.canalOrigen);

  const mesaMan = await save(PdvMesa, { numero: 31, activo: true, estado: 'DISPONIBLE', autoservicioActivo: true, qrToken: 'tok-Man' });
  const pedidoMan = await crearPedidoMesa(mesaMan.id);
  const resMan = await invokeHandlerWithContext('materializar-pedido-online-en-venta', {}, pedidoMan);
  ok(!!resMan?.ventaId, 'ipc materializar-pedido-online-en-venta (con permiso) funciona', resMan);

  await ds.destroy();

  console.log(`\n${failed === 0 ? '✅' : '❌'} MESA_QR: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
