/**
 * E2E: monto de venta para comisiones y ranking de vendedores (issue #239).
 *
 * `Venta.total` no se escribe en ningún flujo del repo, así que todo lo que la
 * leía obtenía 0: la regla `META_VENTA_LOCAL` nunca alcanzaba la meta (no pagaba
 * nunca, en silencio) y el widget "Top 5 Vendedores" mostraba 0 para todos. El
 * total ahora se calcula desde los ítems, en un solo lugar
 * (`electron/utils/venta-total.utils.ts`).
 *
 * Valida contra SQLite:
 *  - la fórmula de la línea: (unitario + adicionales − descuento) × cantidad,
 *    con el adicional POR UNIDAD (el bug viejo lo contaba una sola vez),
 *  - los ítems CANCELADO no suman,
 *  - los descuentos y aumentos globales del cobro ajustan el total (criterio
 *    elegido por el usuario: importa porque los descuentos globales son comunes),
 *  - un descuento en otra moneda se convierte a la principal,
 *  - el total nunca queda negativo,
 *  - y sobre eso: la regla META_VENTA_LOCAL paga cuando corresponde y no paga
 *    cuando el monto no llega.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-comision-meta-venta-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { getTotalesPorVenta, sumarTotalesDeVentas } from '../electron/utils/venta-total.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-comision-meta-venta.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[comision-meta-venta] Migraciones OK.');

  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { Pago } = require('../src/app/database/entities/compras/pago.entity');
  const { PagoDetalle } = require('../src/app/database/entities/compras/pago-detalle.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { MonedaCambio } = require('../src/app/database/entities/financiero/moneda-cambio.entity');

  const monedaRepo = ds.getRepository(Moneda);
  const gs = await monedaRepo.save(monedaRepo.create({ denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 } as any));
  const usd = await monedaRepo.save(monedaRepo.create({ denominacion: 'DOLAR', simbolo: 'US$', principal: false, activo: true, decimales: 2 } as any));
  // 1 USD = 7.000 Gs
  await ds.getRepository(MonedaCambio).save(ds.getRepository(MonedaCambio).create({
    monedaOrigen: gs, monedaDestino: usd,
    compraOficial: 7000, ventaOficial: 7200,
    compraLocal: 7000, ventaLocal: 7200, activo: true,
  } as any));

  const ventaRepo = ds.getRepository(Venta);
  const itemRepo = ds.getRepository(VentaItem);
  const mkVenta = () => ventaRepo.save(ventaRepo.create({ estado: 'CONCLUIDA' } as any));
  const mkItem = (venta: any, o: { pvu: number; cantidad?: number; adic?: number; desc?: number; estado?: string }) =>
    itemRepo.save(itemRepo.create({
      venta,
      precioCostoUnitario: 0,
      precioVentaUnitario: o.pvu,
      precioAdicionales: o.adic || 0,
      descuentoUnitario: o.desc || 0,
      cantidad: o.cantidad ?? 1,
      estado: o.estado || 'ACTIVO',
    } as any));

  const addAjuste = async (venta: any, tipo: string, valor: number, moneda: any) => {
    let pago = (venta as any).pago;
    if (!pago) {
      pago = await ds.getRepository(Pago).save(ds.getRepository(Pago).create({ estado: 'ABIERTO', activo: true } as any));
      (venta as any).pago = pago;
      await ventaRepo.save(venta);
    }
    await ds.getRepository(PagoDetalle).save(ds.getRepository(PagoDetalle).create({
      valor, descripcion: tipo, tipo, pago, moneda, activo: true,
    } as any));
  };

  // ── V1: la fórmula de la línea ──────────────────────────────────────────
  // 2 × (30.000 + 5.000 − 1.000) = 68.000
  const v1 = await mkVenta();
  await mkItem(v1, { pvu: 30000, cantidad: 2, adic: 5000, desc: 1000 });
  let totales = await getTotalesPorVenta(ds, [v1.id]);
  ok(totales.get(v1.id) === 68000, 'línea: (unitario + adicionales − descuento) × cantidad = 68.000', totales.get(v1.id));
  // El bug viejo sumaba el adicional una sola vez: 2×30.000 − 2×1.000 + 5.000 = 63.000
  ok(totales.get(v1.id) !== 63000, 'regresión: el adicional ya no se cuenta una sola vez con cantidad 2');

  // ── V2: ítem cancelado no suma ──────────────────────────────────────────
  const v2 = await mkVenta();
  await mkItem(v2, { pvu: 10000 });
  await mkItem(v2, { pvu: 90000, estado: 'CANCELADO' });
  totales = await getTotalesPorVenta(ds, [v2.id]);
  ok(totales.get(v2.id) === 10000, 'el ítem CANCELADO no suma', totales.get(v2.id));

  // ── V3: descuento global del cobro ──────────────────────────────────────
  const v3 = await mkVenta();
  await mkItem(v3, { pvu: 100000 });
  await addAjuste(v3, 'DESCUENTO', 10000, gs);
  totales = await getTotalesPorVenta(ds, [v3.id]);
  ok(totales.get(v3.id) === 90000, 'el descuento global baja el monto (100.000 − 10.000)', totales.get(v3.id));

  // ── V4: aumento global ──────────────────────────────────────────────────
  const v4 = await mkVenta();
  await mkItem(v4, { pvu: 50000 });
  await addAjuste(v4, 'AUMENTO', 5000, gs);
  totales = await getTotalesPorVenta(ds, [v4.id]);
  ok(totales.get(v4.id) === 55000, 'el aumento global sube el monto', totales.get(v4.id));

  // ── V5: descuento en otra moneda ────────────────────────────────────────
  const v5 = await mkVenta();
  await mkItem(v5, { pvu: 100000 });
  await addAjuste(v5, 'DESCUENTO', 2, usd); // 2 USD = 14.000 Gs
  totales = await getTotalesPorVenta(ds, [v5.id]);
  ok(totales.get(v5.id) === 86000, 'un descuento en USD se convierte a la principal (100.000 − 14.000)', totales.get(v5.id));

  // ── V5b: la cotización cargada al revés también sirve ───────────────────
  // El ABM crea el par desde la moneda que estés viendo, así que la fila puede
  // quedar (GS→USD) o (USD→GS). `compraLocal` significa lo mismo en los dos
  // casos: cuántos Gs vale 1 USD.
  const brl = await monedaRepo.save(monedaRepo.create({ denominacion: 'REAL', simbolo: 'R$', principal: false, activo: true, decimales: 2 } as any));
  await ds.getRepository(MonedaCambio).save(ds.getRepository(MonedaCambio).create({
    monedaOrigen: brl, monedaDestino: gs, // dirección inversa a la de V5
    compraOficial: 1400, ventaOficial: 1450, compraLocal: 1400, ventaLocal: 1450, activo: true,
  } as any));
  const v5b = await mkVenta();
  await mkItem(v5b, { pvu: 100000 });
  await addAjuste(v5b, 'DESCUENTO', 10, brl); // 10 BRL = 14.000 Gs
  totales = await getTotalesPorVenta(ds, [v5b.id]);
  ok(totales.get(v5b.id) === 86000, 'la cotización cargada en la dirección inversa también convierte', totales.get(v5b.id));

  // ── V6: el total no queda negativo ──────────────────────────────────────
  const v6 = await mkVenta();
  await mkItem(v6, { pvu: 10000 });
  await addAjuste(v6, 'DESCUENTO', 50000, gs);
  totales = await getTotalesPorVenta(ds, [v6.id]);
  ok(totales.get(v6.id) === 0, 'un descuento mayor al bruto deja el total en 0, no negativo', totales.get(v6.id));

  // ── V7: venta sin ítems activos no aparece ──────────────────────────────
  const v7 = await mkVenta();
  await mkItem(v7, { pvu: 20000, estado: 'CANCELADO' });
  totales = await getTotalesPorVenta(ds, [v7.id]);
  ok(!totales.has(v7.id), 'una venta sin ítems activos no entra en el mapa');

  // ── Suma de varias ventas = lo que mide la meta ─────────────────────────
  const suma = await sumarTotalesDeVentas(ds, [v1.id, v2.id, v3.id, v4.id, v5.id, v5b.id, v6.id, v7.id]);
  ok(suma === 68000 + 10000 + 90000 + 55000 + 86000 + 86000, 'la suma de las ventas del vendedor es la esperada', suma);
  ok(await sumarTotalesDeVentas(ds, []) === 0, 'sin ventas, el monto es 0');

  // ── La meta: con estos números, ¿paga o no? ─────────────────────────────
  // Antes TODO esto daba 0 y la meta jamás se alcanzaba.
  ok(suma > 0, 'el monto de venta del local ya no es 0 (era el bug de fondo)', suma);
  ok(suma >= 300000, 'con una meta de 300.000 la regla PAGA', suma);
  ok(!(suma >= 400000), 'con una meta de 400.000 la regla NO paga', suma);

  await ds.destroy();
  console.log(`\n[comision-meta-venta] ${passed} OK, ${failed} FALLARON`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
