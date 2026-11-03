/**
 * E2E: la factura de una venta sale por lo que cobra la caja (#325) y
 * `create-factura` lo verifica en el servidor (#240).
 *
 * Los fixtures tienen a propósito varios ítems por venta, cantidades > 1 y las
 * tres tasas de IVA: con un ítem por venta y cantidad 1 no se ven ni una
 * multiplicación olvidada ni un descuento mal repartido.
 *
 * Uso: npm run test:factura-venta
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerFacturacionHandlers } from '../electron/handlers/facturacion.handler';
import { getEstadoCobroVentaInternal } from '../electron/handlers/ventas.handler';
import { getTotalesPorVenta } from '../electron/utils/venta-total.utils';
import { armarFacturaDesdeVenta, calcularFacturaDeVenta } from '../electron/utils/factura-venta.utils';
import { calcularTotalesFactura } from '../src/app/shared/utils/factura-totales.util';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function rechaza(p: Promise<any>, patron: RegExp): Promise<string> {
  try {
    await p;
    return 'NO RECHAZÓ';
  } catch (e: any) {
    const msg = String(e?.message || e);
    return patron.test(msg) ? 'OK' : `OTRO ERROR: ${msg}`;
  }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-factura-venta.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[factura-venta] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Timbrado } = E('facturacion/timbrado.entity');
  const { TimbradoDetalle } = E('facturacion/timbrado-detalle.entity');
  const { Factura } = E('facturacion/factura.entity');
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { VentaItemAdicional } = E('ventas/venta-item-adicional.entity');
  const { Producto } = E('productos/producto.entity');
  const { Adicional } = E('productos/adicional.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, d: any): Promise<any> => R(e).save(R(e).create(d)) as any;

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const sinPermiso = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const rol = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const codigo of ['FACTURACION_EMITIR', 'FACTURACION_ANULAR']) {
    const perm = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role: rol, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role: rol });
  let usuarioActual: any = admin;

  const pyg = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const timbrado = await save(Timbrado, {
    numero: '12345678', fechaInicio: new Date(), fechaFin: new Date(Date.now() + 9e10), activo: true,
  });
  const detalle = await save(TimbradoDetalle, {
    timbrado, establecimiento: '001', puntoExpedicion: '001',
    rangoDesde: 1, rangoHasta: 9999, numeroActual: 1, activo: true,
  });
  registerFacturacionHandlers(ds, () => usuarioActual);

  const fpEf = await save(FormasPago, { nombre: 'EFECTIVO', activo: true, movimentaCaja: true });
  const pPizza = await save(Producto, { nombre: 'PIZZA GRANDE', tipo: 'RETAIL', activo: true, iva: 10 });
  const pGaseosa = await save(Producto, { nombre: 'GASEOSA', tipo: 'RETAIL', activo: true, iva: 10 });
  const pAgua = await save(Producto, { nombre: 'AGUA', tipo: 'RETAIL', activo: true, iva: 5 });
  const pPan = await save(Producto, { nombre: 'PAN', tipo: 'RETAIL', activo: true, iva: 0 });
  const aBorde = await save(Adicional, { nombre: 'BORDE CATUPIRI', precioBase: 5000, activo: true });

  const mkVenta = (costoDelivery = 0) => save(Venta, { estado: 'ABIERTA', costoDelivery });
  const mkItem = (venta: any, producto: any, o: { pvu: number; cantidad?: number; adic?: number | string; desc?: number; estado?: string; ensamblado?: string }) =>
    save(VentaItem, {
      venta: { id: venta.id }, producto: { id: producto.id }, precioCostoUnitario: 0,
      precioVentaUnitario: o.pvu, precioAdicionales: o.adic ?? 0, descuentoUnitario: o.desc ?? 0,
      cantidad: o.cantidad ?? 1, estado: o.estado ?? 'ACTIVO', ensambladoDescripcion: o.ensamblado ?? null,
    });
  const mkAjustes = async (venta: any, ajustes: { tipo: 'DESCUENTO' | 'AUMENTO'; valor: number; activo?: boolean }[]) => {
    const pago = await save(Pago, { estado: 'ABIERTO', activo: true });
    await R(Venta).update({ id: venta.id }, { pago: { id: pago.id } } as any);
    for (const a of ajustes) {
      await save(PagoDetalle, {
        pago: { id: pago.id }, moneda: { id: pyg.id }, formaPago: { id: fpEf.id },
        valor: a.valor, tipo: a.tipo, activo: a.activo !== false, descripcion: a.tipo,
      });
    }
  };

  /** Lo que manda el diálogo, armado desde la propuesta (como `cargarPropuesta` + `facturar`). */
  const payloadDe = (prop: any, extra: any = {}) => ({
    factura: {
      timbradoDetalleId: detalle.id, venta: { id: prop.ventaId }, condicionVenta: 'CONTADO',
      nombreCliente: 'CLIENTE PRUEBA', ruc: '80099999-1', descuento: prop.descuento, ...extra,
    },
    items: prop.lineas.map((l: any) => ({
      descripcion: l.descripcion, cantidad: l.cantidad, precioUnitario: l.precioUnitario, ivaTipo: l.ivaTipo,
      total: l.total, ...(l.ventaItemId ? { ventaItem: { id: l.ventaItemId } } : {}),
      ...(l.productoId ? { producto: { id: l.productoId } } : {}),
    })),
  });
  const emitir = (payload: any) => invokeHandler('create-factura', payload);
  const numeroActual = async () => Number((await R(TimbradoDetalle).findOneBy({ id: detalle.id }))!.numeroActual);
  const contarFacturas = async () => Number((await ds.query('SELECT COUNT(*) c FROM facturas'))[0].c);

  // ═══════ Venta A: el caso completo ═══════
  // Pizza 70.000 + borde 5.000, ×2          → 150.000 (IVA 10)
  // Gaseosa 12.000 − 2.000 de descuento, ×3 →  30.000 (IVA 10)
  // Agua 6.000                              →   6.000 (IVA 5)
  // Pan 4.000 ×2                            →   8.000 (exenta)
  // Ítem cancelado 50.000                   →  afuera
  // Envío 10.000, descuento del cobro 9.000 (+ uno anulado), aumento 1.000
  const vA = await mkVenta(10000);
  const itPizza = await mkItem(vA, pPizza, { pvu: 70000, adic: 5000, cantidad: 2 });
  await save(VentaItemAdicional, { ventaItem: { id: itPizza.id }, adicional: { id: aBorde.id }, precioCobrado: 5000, cantidad: 1, activo: true });
  const aCebolla = await save(Adicional, { nombre: 'CEBOLLA', precioBase: 3000, activo: true });
  await save(VentaItemAdicional, { ventaItem: { id: itPizza.id }, adicional: { id: aCebolla.id }, precioCobrado: 3000, cantidad: 1, activo: false });
  await mkItem(vA, pGaseosa, { pvu: 12000, desc: 2000, cantidad: 3 });
  await mkItem(vA, pAgua, { pvu: 6000 });
  await mkItem(vA, pPan, { pvu: 4000, cantidad: 2 });
  const itCanceladoA = await mkItem(vA, pPizza, { pvu: 50000, estado: 'CANCELADO' });
  await mkAjustes(vA, [
    { tipo: 'DESCUENTO', valor: 9000 }, { tipo: 'DESCUENTO', valor: 99999, activo: false }, { tipo: 'AUMENTO', valor: 1000 },
  ]);

  console.log('\n[A] Propuesta de la venta');
  const propA: any = await calcularFacturaDeVenta(ds, vA.id);
  {
    const pizza = propA.lineas.find((l: any) => l.ventaItemId === itPizza.id);
    ok(pizza?.precioUnitario === 75000 && pizza?.total === 150000, 'A: el adicional entra, por unidad y × cantidad', pizza);
    ok(/BORDE CATUPIRI/.test(pizza?.descripcion || ''), 'A: la descripción lista el adicional', pizza?.descripcion);
    ok(!/CEBOLLA/.test(pizza?.descripcion || ''), 'A: un adicional dado de baja no se nombra', pizza?.descripcion);
    const gaseosa = propA.lineas.find((l: any) => l.descripcion === 'GASEOSA');
    ok(gaseosa?.precioUnitario === 10000 && gaseosa?.total === 30000, 'A: el descuento del ítem resta por unidad × cantidad', gaseosa);
    ok(!propA.lineas.some((l: any) => l.ventaItemId === itCanceladoA.id), 'A: el ítem cancelado no se factura');
    const envio = propA.lineas.find((l: any) => l.tipo === 'DELIVERY');
    ok(envio?.descripcion === 'SERVICIO DE DELIVERY' && envio?.total === 10000 && envio?.ivaTipo === 10, 'A: renglón de envío IVA 10', envio);
    const recargo = propA.lineas.find((l: any) => l.tipo === 'RECARGO');
    ok(recargo?.descripcion === 'RECARGO' && recargo?.total === 1000 && recargo?.ivaTipo === 10, 'A: renglón de recargo IVA 10', recargo);
    ok(propA.descuento === 9000, 'A: descuento del cobro (el anulado no cuenta)', propA.descuento);
    ok(propA.total === 196000, 'A: total 205.000 − 9.000 = 196.000', propA.total);
    // Bruto 10 = 191.000, 5 = 6.000, exenta = 8.000; descuento repartido por base,
    // residuo (−1) a la base mayor; IVA sobre la base neta.
    ok(propA.gravada10 === 182614 && propA.gravada5 === 5737 && propA.exenta === 7649,
      'A: descuento repartido entre las tres bases', { g10: propA.gravada10, g5: propA.gravada5, ex: propA.exenta });
    ok(propA.gravada10 + propA.gravada5 + propA.exenta === propA.total, 'A: las bases netas suman el total');
    ok(propA.iva10 === 16601 && propA.iva5 === 273, 'A: IVA sobre la base neta', { iva10: propA.iva10, iva5: propA.iva5 });
  }

  console.log('\n[B] Paridad con la caja y los reportes');
  {
    const cobro: any = await getEstadoCobroVentaInternal(ds, vA.id);
    const caja = cobro.deudaBruta - cobro.descuentoGlobal + cobro.aumentoGlobal;
    ok(caja === propA.total, 'B: factura == lo que cobra la caja', { caja, factura: propA.total });
    const rep = (await getTotalesPorVenta(ds, [vA.id])).get(vA.id)! + 10000;
    ok(rep === propA.total, 'B: factura == reportes + envío', { rep, factura: propA.total });
  }

  console.log('\n[C] Canal get-factura-propuesta-venta');
  {
    const p: any = await Promise.resolve().then(() => invokeHandler('get-factura-propuesta-venta', vA.id)).catch((e) => ({ error: String(e) }));
    ok(p?.total === propA.total && p?.lineas?.length === propA.lineas.length, 'C: devuelve la misma propuesta');
    ok(!JSON.stringify(p).includes('precioCosto'), 'C: no publica costos');
    usuarioActual = sinPermiso;
    ok(await rechaza(Promise.resolve().then(() => invokeHandler('get-factura-propuesta-venta', vA.id)), /PERMISO/i) === 'OK', 'C: sin FACTURACION_EMITIR, rechazado');
    usuarioActual = admin;
  }

  console.log('\n[D] Emitir la factura de la venta');
  let facturaA: any;
  {
    const antes = await numeroActual();
    const payload = payloadDe(propA, { gravada10: 1, gravada5: 1, exenta: 1, iva10: 1, iva5: 1, total: 1, estado: 'ANULADA', fecha: '2001-01-01' });
    payload.items.forEach((it: any) => { it.total = 1; });
    // Dentro de la tolerancia de precio: se guarda el de la venta, no el del payload.
    payload.items[0].precioUnitario += 0.004;
    // La descripción del envío editada: se reconoce por monto e IVA y se guarda la de la venta.
    payload.items.find((it: any) => it.descripcion === 'SERVICIO DE DELIVERY').descripcion = 'ENVIO';
    facturaA = await emitir(payload);
    ok(!!facturaA?.numeroCompleto && (await numeroActual()) === antes + 1, 'D: se emite y numera', facturaA?.numeroCompleto);
    ok(Number(facturaA.total) === 196000, 'D: total = cobro, no el del payload', facturaA.total);
    ok(Number(facturaA.gravada10) === 182614 && Number(facturaA.iva10) === 16601 && Number(facturaA.iva5) === 273,
      'D: subtotales e IVA recalculados en el servidor', { g10: facturaA.gravada10, iva10: facturaA.iva10 });
    const sumaItems = (facturaA.items || []).reduce((s: number, it: any) => s + Number(it.total), 0);
    ok(sumaItems === 205000, 'D: total de cada renglón recalculado', sumaItems);
    ok(facturaA.moneda?.id === pyg.id, 'D: la moneda queda en la principal', facturaA.moneda);
    ok(Number(facturaA.gravada5) === 5737 && Number(facturaA.exenta) === 7649 && Number(facturaA.descuento) === 9000,
      'D: gravada 5, exenta y descuento del servidor', { g5: facturaA.gravada5, ex: facturaA.exenta, d: facturaA.descuento });
    ok(facturaA.estado === 'EMITIDA' && new Date(facturaA.fecha).getFullYear() > 2001, 'D: estado y fecha no salen del payload', { e: facturaA.estado, f: facturaA.fecha });
    const renglonPizza = (facturaA.items || []).find((it: any) => Number(it.total) === 150000);
    ok(Number(renglonPizza?.precioUnitario) === 75000, 'D: se guarda el precio de la venta, no el del payload', renglonPizza?.precioUnitario);
    ok((facturaA.items || []).some((it: any) => it.descripcion === 'SERVICIO DE DELIVERY'), 'D: el envío se guarda con su descripción');
  }

  console.log('\n[E] Una sola factura EMITIDA por venta');
  {
    const n = await numeroActual();
    const c = await contarFacturas();
    ok(await rechaza(emitir(payloadDe(propA)), /ya tiene la factura/) === 'OK', 'E: la segunda se rechaza');
    ok((await numeroActual()) === n && (await contarFacturas()) === c, 'E: no consume número ni guarda nada');
    await invokeHandler('anular-factura', facturaA.id, 'PRUEBA');
    const otra: any = await emitir(payloadDe(propA));
    ok(!!otra?.id && otra.id !== facturaA.id, 'E: anulada la anterior, se puede emitir otra');
  }

  // ═══════ Venta B: rechazos ═══════
  const vB = await mkVenta(0);
  const itB1 = await mkItem(vB, pPizza, { pvu: 70000, adic: 5000, cantidad: 2 });
  await mkItem(vB, pGaseosa, { pvu: 12000, cantidad: 2 });
  const itBCancelado = await mkItem(vB, pGaseosa, { pvu: 12000, estado: 'CANCELADO' });
  await mkAjustes(vB, [{ tipo: 'DESCUENTO', valor: 4000 }]);
  const propB: any = await calcularFacturaDeVenta(ds, vB.id);

  console.log('\n[F] create-factura rechaza lo que no es la venta');
  {
    const n = await numeroActual();
    const c = await contarFacturas();
    const caso = async (nombre: string, mutar: (p: any) => void, patron: RegExp) => {
      const p = payloadDe(propB);
      mutar(p);
      const r = await rechaza(emitir(p), patron);
      ok(r === 'OK', `F: ${nombre}`, r);
    };
    await caso('ítem de otra venta', (p) => { p.items[0].ventaItem = { id: itPizza.id }; }, /no pertenece a la venta/);
    await caso('ítem cancelado', (p) => {
      p.items.push({ descripcion: 'GASEOSA', cantidad: 1, precioUnitario: 12000, ivaTipo: 10, ventaItem: { id: itBCancelado.id } });
    }, /cancelado/);
    await caso('ítem repetido', (p) => { p.items.push({ ...p.items[0] }); }, /dos veces/);
    await caso('precio cambiado (sin adicional, como antes de #325)', (p) => { p.items[0].precioUnitario = 70000; }, /no coincide con la venta/);
    await caso('IVA cambiado', (p) => { p.items[1].ivaTipo = 0; }, /no coincide con la venta/);
    await caso('precio un guaraní distinto', (p) => { p.items[0].precioUnitario += 1; }, /no coincide con la venta/);
    await caso('cantidad × precio iguales pero repartidos distinto', (p) => { p.items[0].cantidad = 1; p.items[0].precioUnitario *= 2; }, /no coincide con la venta/);
    await caso('descuento un poco mayor', (p) => { p.factura.descuento += 2; }, /descuento/);
    await caso('sin renglones', (p) => { p.items = []; }, /no coincide con la venta|no tiene renglones/);
    await caso('renglón inventado que cuadra el total', (p) => {
      const quitado = p.items.splice(1, 1)[0];
      p.items.push({ descripcion: 'VARIOS', cantidad: 1, precioUnitario: quitado.cantidad * quitado.precioUnitario, ivaTipo: 10 });
    }, /no corresponde a la venta/);
    await caso('falta un renglón', (p) => { p.items.splice(1, 1); }, /no coincide con la venta/);
    await caso('descuento distinto al del cobro', (p) => { p.factura.descuento = 0; }, /descuento/);
    await caso('ítem de venta en una factura sin venta', (p) => { delete p.factura.venta; }, /necesita la venta/);
    await caso('venta inexistente', (p) => { p.factura.venta = { id: 999999 }; }, /no existe/);
    ok((await numeroActual()) === n && (await contarFacturas()) === c, 'F: ningún rechazo consumió número ni guardó');
    ok(itB1.id > 0, 'F: fixture B');
  }

  console.log('\n[F2] Renglones de envío y recargo');
  {
    const vS = await mkVenta(8000);
    await mkItem(vS, pGaseosa, { pvu: 12000, cantidad: 2 });
    await mkAjustes(vS, [{ tipo: 'AUMENTO', valor: 2000 }]);
    const propS: any = await calcularFacturaDeVenta(ds, vS.id);
    const iEnvio = propS.lineas.findIndex((l: any) => l.tipo === 'DELIVERY');
    const iRecargo = propS.lineas.findIndex((l: any) => l.tipo === 'RECARGO');
    const caso = async (nombre: string, mutar: (p: any) => void) => {
      const p = payloadDe(propS);
      mutar(p);
      const r = await rechaza(emitir(p), /no corresponde a la venta|no coincide con la venta/);
      ok(r === 'OK', `F2: ${nombre}`, r);
    };
    await caso('envío con IVA exento', (p) => { p.items[iEnvio].ivaTipo = 0; });
    await caso('envío por otro monto', (p) => { p.items[iEnvio].precioUnitario = 7000; p.items[0].precioUnitario += 500; });
    await caso('recargo con IVA 5', (p) => { p.items[iRecargo].ivaTipo = 5; });
    await caso('recargo duplicado en lugar del envío', (p) => { p.items[iEnvio] = { ...p.items[iRecargo] }; });
    const f: any = await emitir(payloadDe(propS));
    ok(Number(f?.total) === 34000, 'F2: con envío y recargo correctos, se emite', f?.total);
  }

  console.log('\n[F3] Payload que intenta pisar otra factura');
  {
    const previa: any = await R(Factura).findOne({ where: { id: facturaA.id }, relations: ['items'] });
    const vX = await mkVenta(0);
    await mkItem(vX, pAgua, { pvu: 6000 });
    const propX: any = await calcularFacturaDeVenta(ds, vX.id);
    const p: any = payloadDe(propX, { id: facturaA.id, numeroFactura: 1, numeroCompleto: '999-999-9999999' });
    p.items[0].id = previa.items[0].id;
    p.items[0].factura = { id: facturaA.id };
    const nueva: any = await emitir(p);
    const despues: any = await R(Factura).findOne({ where: { id: facturaA.id }, relations: ['items'] });
    ok(nueva?.id !== facturaA.id, 'F3: un id en el payload no pisa una factura existente', nueva?.id);
    ok(despues.items.length === previa.items.length && Number(despues.total) === Number(previa.total) && despues.estado === previa.estado,
      'F3: la factura y los renglones previos quedan intactos');
    ok(nueva.numeroCompleto !== '999-999-9999999', 'F3: el número no sale del payload', nueva.numeroCompleto);
  }

  console.log('\n[F4] Número manual del pre-impreso');
  {
    const vM = await mkVenta(0);
    await mkItem(vM, pAgua, { pvu: 6000 });
    const propM: any = await calcularFacturaDeVenta(ds, vM.id);
    const n = await numeroActual();
    ok(await rechaza(emitir(payloadDe(propM, { numeroManual: 1.5 })), /no es válido/) === 'OK', 'F4: número no entero, rechazado');
    ok(await rechaza(emitir(payloadDe(propM, { numeroManual: 1 })), /ya fue usado/) === 'OK', 'F4: número ya usado, rechazado');
    ok((await numeroActual()) === n, 'F4: los rechazos no movieron el contador');
    const f: any = await emitir(payloadDe(propM, { numeroManual: n + 5 }));
    ok(f?.numeroFactura === n + 5 && (await numeroActual()) === n + 6, 'F4: número libre, aceptado y el contador avanza', f?.numeroFactura);
  }

  console.log('\n[G] Modo Resumido');
  {
    const vC = await mkVenta(15000);
    await mkItem(vC, pPizza, { pvu: 70000, adic: 5000, cantidad: 2 });
    await mkItem(vC, pPan, { pvu: 4000, cantidad: 3 });
    await mkAjustes(vC, [{ tipo: 'DESCUENTO', valor: 7000 }]);
    const propC: any = await calcularFacturaDeVenta(ds, vC.id);
    const resumido = (total: number) => ({
      factura: { timbradoDetalleId: detalle.id, venta: { id: vC.id }, nombreCliente: 'X', ruc: '1', descuento: 0 },
      items: [{ descripcion: 'CONSUMISION', cantidad: 1, precioUnitario: total, ivaTipo: 10 }],
    });
    ok(await rechaza(emitir(resumido(propC.total - 5000)), /no coincide con la venta/) === 'OK', 'G: Resumido por menos, rechazado');
    const exento: any = resumido(propC.total); exento.items[0].ivaTipo = 0;
    ok(await rechaza(emitir(exento), /resumida/) === 'OK', 'G: Resumido exento por el total, rechazado');
    const conDesc: any = resumido(propC.total + 7000); conDesc.factura.descuento = 7000;
    ok(await rechaza(emitir(conDesc), /resumida/) === 'OK', 'G: Resumido con descuento inventado, rechazado');
    const dos: any = resumido(propC.total / 2); dos.items[0].cantidad = 2;
    ok(await rechaza(emitir(dos), /resumida/) === 'OK', 'G: Resumido con cantidad 2, rechazado');
    const f: any = await emitir(resumido(propC.total));
    ok(Number(f?.total) === 170000 && propC.total === 170000, 'G: Resumido con envío y descuento, aceptado', { f: f?.total, p: propC.total });
  }

  console.log('\n[H] Factura manual (sin venta)');
  {
    const f: any = await emitir({
      factura: { timbradoDetalleId: detalle.id, nombreCliente: 'X', ruc: '1', descuento: 1100, total: 5 },
      items: [
        { descripcion: 'A', cantidad: 2, precioUnitario: 5500, ivaTipo: 10 },
        { descripcion: 'B', cantidad: 1, precioUnitario: 0, ivaTipo: 5 },
      ],
    });
    ok(Number(f?.total) === 9900 && Number(f?.gravada10) === 9900 && Number(f?.iva10) === 900,
      'H: se recalcula (total del payload ignorado, IVA sobre la base neta)', { t: f?.total, g: f?.gravada10, i: f?.iva10 });
  }

  console.log('\n[H2] Factura vacía');
  {
    ok(await rechaza(emitir({ factura: { timbradoDetalleId: detalle.id, nombreCliente: 'X', ruc: '1' }, items: [] }), /no tiene renglones/) === 'OK',
      'H2: factura manual sin renglones, rechazada');
    const vV = await mkVenta(0);
    ok(await rechaza(emitir({ factura: { timbradoDetalleId: detalle.id, venta: { id: vV.id }, nombreCliente: 'X', ruc: '1' }, items: [] }), /no tiene renglones/) === 'OK',
      'H2: venta sin ítems, rechazada');
  }

  console.log('\n[I] Emisiones simultáneas');
  {
    const vD = await mkVenta(0);
    await mkItem(vD, pGaseosa, { pvu: 12000, cantidad: 2 });
    const propD: any = await calcularFacturaDeVenta(ds, vD.id);
    const r = await Promise.allSettled([emitir(payloadDe(propD)), emitir(payloadDe(propD))]);
    const okas = r.filter((x) => x.status === 'fulfilled');
    ok(okas.length === 1, 'I: misma venta dos veces a la vez → una sola factura', r.map((x) => x.status));
    const emitidas = await R(Factura).count({ where: { venta: { id: vD.id }, estado: 'EMITIDA' } as any });
    ok(emitidas === 1, 'I: una sola EMITIDA en la base', emitidas);

    const vE = await mkVenta(0);
    await mkItem(vE, pAgua, { pvu: 6000 });
    const vF = await mkVenta(0);
    await mkItem(vF, pAgua, { pvu: 6000 });
    const [pE, pF] = [await calcularFacturaDeVenta(ds, vE.id), await calcularFacturaDeVenta(ds, vF.id)];
    const [fE, fF]: any[] = await Promise.all([emitir(payloadDe(pE)), emitir(payloadDe(pF))]);
    ok(fE.numeroFactura !== fF.numeroFactura, 'I: dos ventas a la vez → números distintos', [fE.numeroFactura, fF.numeroFactura]);
    const nums: any[] = await ds.query('SELECT numero_factura n FROM facturas');
    ok(new Set(nums.map((x) => x.n)).size === nums.length, 'I: ningún número repetido en toda la corrida');
  }

  console.log('\n[J] Adicionales fraccionarios (pizza por sabores)');
  {
    // Como `persistirPersonalizacionConSabor`: adicional 5.001 × ½ sabor = 2.500,50 por unidad.
    const vG = await mkVenta(0);
    const it = await mkItem(vG, pPizza, { pvu: 80000, adic: 2500.5, ensamblado: '1/2 MUSARELLA + 1/2 PEPPERONI' });
    await save(VentaItemAdicional, { ventaItem: { id: it.id }, adicional: { id: aBorde.id }, precioCobrado: 2500.5, cantidad: 1, activo: true });
    const p: any = await calcularFacturaDeVenta(ds, vG.id);
    ok(/1\/2 MUSARELLA \+ 1\/2 PEPPERONI \+ BORDE CATUPIRI/.test(p.lineas[0].descripcion), 'J: descripción con sabores y adicional', p.lineas[0].descripcion);
    const cobro: any = await getEstadoCobroVentaInternal(ds, vG.id);
    ok(Math.abs(cobro.deudaBruta - p.total) <= 1, 'J: total dentro de ±1 del cobro', { cobro: cobro.deudaBruta, p: p.total });
    const f: any = await emitir(payloadDe(p));
    ok(Number(f?.total) === p.total, 'J: se emite', f?.total);
  }

  console.log('\n[K] Función pura: strings de Postgres y bordes');
  {
    const t = calcularTotalesFactura([{ cantidad: '2.000', precioUnitario: '75000.00', ivaTipo: '10' }], '0');
    ok(t.total === 150000 && t.gravada10 === 150000, 'K: decimales como string no concatenan', t);
    const p = armarFacturaDesdeVenta({
      ventaId: 1, costoDelivery: '10000.00', descuentoGlobal: 0, aumentoGlobal: 0,
      items: [{ id: 1, cantidad: '2.000', precioVentaUnitario: '70000.00', precioAdicionales: '5000.00', descuentoUnitario: '0.00',
        productoId: 1, productoNombre: 'PIZZA', ivaTipo: 10, adicionales: [] }],
    });
    ok(p.lineas[0].precioUnitario === 75000 && p.total === 160000, 'K: propuesta con strings', { pu: p.lineas[0].precioUnitario, t: p.total });
    const tope = calcularTotalesFactura([{ cantidad: 1, precioUnitario: 1000, ivaTipo: 10 }], 5000);
    ok(tope.total === 0 && tope.descuento === 1000 && tope.gravada10 === 0, 'K: descuento mayor al bruto → total 0', tope);
    const iva = calcularTotalesFactura([{ cantidad: 1, precioUnitario: 16, ivaTipo: 10 }], 0);
    ok(iva.iva10 === 1, 'K: IVA redondea, no trunca (16/11 = 1,45 → 1; 17/11 = 1,55 → 2)', iva.iva10);
    ok(calcularTotalesFactura([{ cantidad: 1, precioUnitario: 17, ivaTipo: 10 }], 0).iva10 === 2, 'K: 17/11 → 2');
    // Bases 10 = 100, 5 = 300, exenta = 100; descuento 3 → total 497. Redondeado:
    // 99 + 298 + 99 = 496; el residuo (+1) va a la base mayor, que es la de 5.
    const res = calcularTotalesFactura([
      { cantidad: 1, precioUnitario: 100, ivaTipo: 10 }, { cantidad: 1, precioUnitario: 300, ivaTipo: 5 }, { cantidad: 1, precioUnitario: 100, ivaTipo: 0 },
    ], 3);
    ok(res.gravada5 === 299 && res.gravada10 === 99 && res.exenta === 99 && res.total === 497, 'K: el residuo va a la base mayor (5)', res);
    const neg = calcularTotalesFactura([{ cantidad: 1, precioUnitario: 1000, ivaTipo: 10 }], -500);
    ok(neg.total === 1000 && neg.descuento === 0, 'K: un descuento negativo no suma', neg);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} factura-venta: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
