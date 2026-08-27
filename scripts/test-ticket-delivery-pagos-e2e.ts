/**
 * E2E: pagos ya registrados en los tickets de delivery.
 *
 * Un delivery puede tener plata cargada antes de imprimirse —cobro anticipado,
 * una ronda de cobro parcial, un pedido de la web pagado online— y el papel no
 * decía nada. Este test fija:
 *
 *  - que el desglose se imprima con la MISMA organización que el resumen de
 *    cierre de caja (forma de pago agrupando, moneda adentro),
 *  - que el número grande sea el SALDO y no el total cuando ya se cobró algo,
 *  - que un delivery sin pagos imprima exactamente lo de antes,
 *  - que el comprobante y la pre-cuenta de una venta CON delivery lleven el
 *    bloque, y que una venta sin delivery no cambie.
 *
 * Uso: npm run test:ticket-delivery-pagos
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { buildDeliveryTicketLines, buildVentaTicketLines } from '../electron/handlers/documentos-tickets.handler';
import { renderTicketToPlainText, invalidateTicketEmpresaCache } from '../electron/utils/ticket.utils';

const WIDTH = 48;
/** El caso apretado: 58mm. Acá es donde una etiqueta larga desborda. */
const WIDTH_ANGOSTO = 32;

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const render = (lines: any[], width = WIDTH): string =>
  renderTicketToPlainText({ printerWidth: width, lines, cutAtEnd: true });

/** Ninguna línea del ticket puede pasarse del ancho de la impresora. */
function ningunaLineaDesborda(texto: string, width: number): boolean {
  return texto.split('\n').every((l) => l.length <= width);
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-ticket-delivery-pagos.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[ticket-delivery-pagos] Migraciones OK.');
  invalidateTicketEmpresaCache();

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Venta } = E('ventas/venta.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Delivery } = E('ventas/delivery.entity');
  const { Producto } = E('productos/producto.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { Pago } = E('compras/pago.entity');
  const { PagoDetalle } = E('compras/pago-detalle.entity');
  const { Caja } = E('financiero/caja.entity');
  const { Conteo } = E('financiero/conteo.entity');
  const { Dispositivo } = E('financiero/dispositivo.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const usd: any = await save(Moneda, {
    denominacion: 'DOLAR', simbolo: '$', principal: false, activo: true, decimales: 2, countryCode: 'US',
  });
  // 1 USD = 7.500 Gs.
  await save(MonedaCambio, {
    monedaOrigen: { id: gs.id }, monedaDestino: { id: usd.id },
    compraOficial: 7400, ventaOficial: 7700, compraLocal: 7500, ventaLocal: 7600, activo: true,
  });

  const fpEfectivo: any = await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });
  const fpTransferencia: any = await save(FormasPago, { nombre: 'TRANSFERENCIA', activo: true, movimentaCaja: true });
  const fpCredito: any = await save(FormasPago, { nombre: 'CREDITO', activo: true, movimentaCaja: false });
  const fpLarga: any = await save(FormasPago, { nombre: 'TRANSFERENCIA BANCARIA BBVA CONTINENTAL', activo: true, movimentaCaja: true });

  const producto: any = await save(Producto, { nombre: 'PIZZA GRANDE', tipo: 'RETAIL', activo: true });

  const dispositivo: any = await save(Dispositivo, { nombre: 'TERMINAL', activo: true });
  const conteo: any = await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });
  const caja: any = await save(Caja, {
    estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
    dispositivo: { id: dispositivo.id }, conteoApertura: { id: conteo.id },
  });

  let seq = 0;
  /**
   * Delivery + venta + items. `pagos` son las líneas ya registradas.
   */
  async function armarDelivery(opts: {
    totalItem: number;
    costoEnvio?: number;
    estadoVenta?: string;
    pagos?: { fp: any; moneda: any; valor: number; tipo?: string }[];
  }): Promise<{ deliveryId: number; ventaId: number }> {
    seq++;
    const delivery: any = await save(Delivery, {
      nombre: `CLIENTE ${seq}`, telefono: '0981000000', direccion: 'AVDA SIEMPREVIVA 742',
      estado: 'ABIERTO', modo: 'DELIVERY', fechaAbierto: new Date(), cobroAnticipado: false,
    });
    const venta: any = await save(Venta, {
      estado: opts.estadoVenta || 'ABIERTA', caja: { id: caja.id },
      delivery: { id: delivery.id }, costoDelivery: opts.costoEnvio ?? 0,
    });
    await save(VentaItem, {
      venta: { id: venta.id }, producto: { id: producto.id }, cantidad: 1,
      precioVentaUnitario: opts.totalItem, precioCostoUnitario: 0,
      precioAdicionales: 0, descuentoUnitario: 0, estado: 'ACTIVO',
    });
    if (opts.pagos?.length) {
      const pago: any = await save(Pago, { estado: 'ABIERTO', activo: true, caja: { id: caja.id } });
      for (const p of opts.pagos) {
        await save(PagoDetalle, {
          valor: p.valor, descripcion: 'COBRO DE VENTA', tipo: p.tipo || 'PAGO',
          pago: { id: pago.id }, moneda: { id: p.moneda.id }, formaPago: { id: p.fp.id }, activo: true,
        });
      }
      await ds.getRepository(Venta).update(venta.id, { pago: { id: pago.id } } as any);
    }
    return { deliveryId: delivery.id, ventaId: venta.id };
  }

  // ── 1. Delivery SIN pagos: el ticket de siempre ───────────────────────────
  console.log('\n[1] Delivery sin pagos registrados');
  {
    const { deliveryId } = await armarDelivery({ totalItem: 100000, costoEnvio: 15000 });
    const build = (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!;
    const txt = render(build.lines);
    ok(build.total === 115000, 'total = items + envío', build.total);
    ok(build.yaPagado === 0 && build.saldo === 115000, 'saldo = total', { p: build.yaPagado, s: build.saldo });
    ok(!txt.includes('PAGOS REGISTRADOS'), 'no aparece el bloque de pagos');
    ok(txt.includes('A COBRAR'), 'sigue diciendo A COBRAR');
    ok(!txt.includes('SALDO A COBRAR'), 'no aparece SALDO A COBRAR');
    ok(txt.includes('115.000'), 'el número grande es el total');
  }

  // ── 2. Pago parcial: el número grande pasa a ser el saldo ─────────────────
  console.log('\n[2] Delivery con pago parcial');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 100000, costoEnvio: 15000,
      pagos: [{ fp: fpEfectivo, moneda: gs, valor: 40000 }],
    });
    const build = (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!;
    const txt = render(build.lines);
    ok(build.yaPagado === 40000, 'ya pagado = 40.000', build.yaPagado);
    ok(build.saldo === 75000, 'saldo = 115.000 − 40.000', build.saldo);
    ok(txt.includes('PAGOS REGISTRADOS'), 'aparece el bloque de pagos');
    ok(/EFECTIVO\s+\.*\s*Gs\. 40\.000/.test(txt) || txt.includes('40.000'), 'la línea de efectivo sale con su monto');
    ok(txt.includes('SALDO A COBRAR'), 'el destacado es el SALDO');
    ok(txt.includes('YA PAGADO'), 'se imprime lo ya pagado');
    ok(txt.includes('75.000'), 'el saldo impreso es 75.000');
  }

  // ── 3. Una forma de pago en DOS monedas → cabecera + indentadas ───────────
  console.log('\n[3] Layout multimoneda (igual al cierre de caja)');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 200000,
      pagos: [
        { fp: fpEfectivo, moneda: gs, valor: 50000 },
        { fp: fpEfectivo, moneda: usd, valor: 4 },          // 4 USD = 30.000 Gs
        { fp: fpTransferencia, moneda: gs, valor: 20000 },
      ],
    });
    const build = (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!;
    const txt = render(build.lines);
    const lineas = txt.split('\n');

    // EFECTIVO tiene 2 monedas: el nombre va SOLO en su línea (sin importe) y
    // debajo van las dos monedas indentadas.
    const idxEfectivo = lineas.findIndex((l) => l.trim() === 'EFECTIVO');
    ok(idxEfectivo >= 0, 'EFECTIVO es una cabecera sin importe (2 monedas)');
    ok(/^\s+Gs\./.test(lineas[idxEfectivo + 1] || ''), 'debajo, la moneda Gs indentada', lineas[idxEfectivo + 1]);
    ok(/^\s+\$/.test(lineas[idxEfectivo + 2] || ''), 'debajo, la moneda $ indentada', lineas[idxEfectivo + 2]);

    // TRANSFERENCIA tiene 1 sola moneda: nombre e importe en la MISMA línea.
    const lineaTransf = lineas.find((l) => l.includes('TRANSFERENCIA'));
    ok(!!lineaTransf && lineaTransf.includes('20.000'), 'TRANSFERENCIA sale en una sola línea con su importe', lineaTransf);

    // 50.000 + (4 × 7.500) + 20.000 = 100.000
    ok(build.yaPagado === 100000, 'el USD se convirtió con la cotización', build.yaPagado);
    ok(build.saldo === 100000, 'saldo = 200.000 − 100.000', build.saldo);
  }

  // ── 4. Vuelto: no ensucia el desglose, sí resta del cobrado ───────────────
  console.log('\n[4] Vuelto');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 100000,
      pagos: [
        { fp: fpTransferencia, moneda: gs, valor: 120000 },
        { fp: fpEfectivo, moneda: gs, valor: 20000, tipo: 'VUELTO' },
      ],
    });
    const build = (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!;
    const txt = render(build.lines);
    ok(build.yaPagado === 100000, 'cobrado neto = 120.000 − 20.000', build.yaPagado);
    ok(build.saldo === 0, 'no queda saldo', build.saldo);
    ok(txt.includes('VUELTO'), 'el vuelto sale como línea propia');
    // Lo que NO puede pasar: una fila EFECTIVO en negativo por netear el vuelto
    // contra una forma de pago con la que no se cobró nada.
    ok(!/EFECTIVO.*-/.test(txt), 'no hay una fila EFECTIVO negativa');
    ok(txt.includes('PAGADO'), 'con saldo 0 dice PAGADO — NO COBRAR');
  }

  // ── 5. Descuento global: el total del ticket lo aplica ────────────────────
  console.log('\n[5] Descuento de nivel pago');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 100000,
      pagos: [
        { fp: fpEfectivo, moneda: gs, valor: 80000 },
        { fp: fpEfectivo, moneda: gs, valor: 20000, tipo: 'DESCUENTO' },
      ],
    });
    const build = (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!;
    const txt = render(build.lines);
    // Antes el ticket de delivery ignoraba descPago y este total daba 100.000,
    // así que el saldo hubiera dado 20.000 y el repartidor cobraba un descuento
    // que el cajero ya había otorgado.
    ok(build.total === 80000, 'el total descuenta el ajuste del pago', build.total);
    ok(build.yaPagado === 80000, 'la línea de DESCUENTO no cuenta como plata cobrada', build.yaPagado);
    ok(build.saldo === 0, 'saldo 0: está pago', build.saldo);
    ok(txt.includes('DESCUENTO'), 'el descuento sale en el bloque de totales');
  }

  // ── 6. Venta a crédito: el ticket no puede afirmar que entró plata ────────
  console.log('\n[6] Venta a crédito');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 150000, estadoVenta: 'CONCLUIDA',
      pagos: [{ fp: fpCredito, moneda: gs, valor: 150000 }],
    });
    const txt = render((await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH }))!.lines);
    ok(txt.includes('CREDITO'), 'la forma de pago CREDITO se nombra');
    ok(txt.includes('(A CREDITO)'), 'y se marca que no movió el cajón');
    ok(txt.includes('NO COBRAR'), 'el repartidor no cobra en la puerta');
  }

  // ── 7. 32 columnas y una forma de pago larguísima ─────────────────────────
  console.log('\n[7] Impresora de 58mm (32 columnas)');
  {
    const { deliveryId } = await armarDelivery({
      totalItem: 1500000,
      pagos: [{ fp: fpLarga, moneda: gs, valor: 500000 }],
    });
    const txt = render(
      (await buildDeliveryTicketLines(ds, deliveryId, { width: WIDTH_ANGOSTO }))!.lines,
      WIDTH_ANGOSTO,
    );
    ok(ningunaLineaDesborda(txt, WIDTH_ANGOSTO), 'ninguna línea pasa de 32 columnas');
    ok(txt.includes('500.000'), 'el importe sigue estando (no quedó huérfano)');
    // A 32 columnas la clave se corta en 18 caracteres para dejar lugar al
    // importe: "TRANSFERENCIA BANC". Truncado, pero identificable.
    ok(/TRANSFERENCIA BANC/.test(txt), 'el nombre se trunca pero se reconoce',
      txt.split('\n').filter((l) => l.includes('TRANSFER')));
  }

  // ── 8. Comprobante y pre-cuenta ───────────────────────────────────────────
  console.log('\n[8] Comprobante y pre-cuenta');
  {
    const { ventaId } = await armarDelivery({
      totalItem: 100000, estadoVenta: 'CONCLUIDA',
      pagos: [
        { fp: fpEfectivo, moneda: gs, valor: 60000 },
        { fp: fpTransferencia, moneda: gs, valor: 40000 },
      ],
    });
    const comprobante = render((await buildVentaTicketLines(ds, ventaId, { width: WIDTH }))!.lines);
    ok(comprobante.includes('FORMAS DE PAGO'), 'el comprobante de un delivery lleva el desglose');
    ok(comprobante.includes('EFECTIVO') && comprobante.includes('TRANSFERENCIA'), 'con las dos formas de pago');

    const precuenta = render((await buildVentaTicketLines(ds, ventaId, { width: WIDTH, isPrecuenta: true }))!.lines);
    ok(precuenta.includes('PAGOS REGISTRADOS'), 'la pre-cuenta muestra lo ya registrado');
  }

  // ── 9. Venta SIN delivery: no cambia nada ─────────────────────────────────
  console.log('\n[9] Venta de mostrador (regresión)');
  {
    const venta: any = await save(Venta, {
      estado: 'CONCLUIDA', caja: { id: caja.id }, formaPago: { id: fpEfectivo.id },
    });
    await save(VentaItem, {
      venta: { id: venta.id }, producto: { id: producto.id }, cantidad: 1,
      precioVentaUnitario: 50000, precioCostoUnitario: 0,
      precioAdicionales: 0, descuentoUnitario: 0, estado: 'ACTIVO',
    });
    const pago: any = await save(Pago, { estado: 'PAGADO', activo: true, caja: { id: caja.id } });
    await save(PagoDetalle, {
      valor: 50000, descripcion: 'COBRO DE VENTA', tipo: 'PAGO',
      pago: { id: pago.id }, moneda: { id: gs.id }, formaPago: { id: fpEfectivo.id }, activo: true,
    });
    await ds.getRepository(Venta).update(venta.id, { pago: { id: pago.id } } as any);

    const txt = render((await buildVentaTicketLines(ds, venta.id, { width: WIDTH }))!.lines);
    ok(txt.includes('FORMA PAGO'), 'sigue la línea única histórica');
    ok(!txt.includes('FORMAS DE PAGO'), 'sin desglose: el cobro fue de una sola vez frente al cajero');
  }

  console.log(`\n[ticket-delivery-pagos] ${passed} OK, ${failed} fallidos`);
  await ds.destroy();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
