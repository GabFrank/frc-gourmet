/**
 * E2E: reporte de cierre de mes — Ventas.
 *
 * Ejercita `construirReporteVentasCierre` (agregaciones reales) contra SQLite
 * con migraciones: KPIs (facturación/tickets/ticket promedio/margen/mesas),
 * día de semana, top productos con margen, mix de forma de pago, market-basket
 * (combinaciones), tendencia y comparativo vs período anterior.
 *
 * Uso: npm run test:reporte-ventas
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { construirReporteVentasCierre } from '../electron/handlers/reportes-ventas.helper';
import { resolverPeriodo } from '../electron/handlers/reportes-periodo.util';
import { getInicioJornada } from '../electron/handlers/dashboard-ventas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-reporte-ventas.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[reporte-ventas] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { FormasPago } = require('../src/app/database/entities/compras/forma-pago.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { PdvMesa } = require('../src/app/database/entities/ventas/pdv-mesa.entity');
  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { Pago } = require('../src/app/database/entities/compras/pago.entity');
  const { PagoDetalle } = require('../src/app/database/entities/compras/pago-detalle.entity');

  const pyg = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: '₲', principal: true, decimales: 0, activo: true } as any));
  const efectivo = await ds.getRepository(FormasPago).save(ds.getRepository(FormasPago).create({ nombre: 'EFECTIVO', activo: true, movimentaCaja: true } as any));
  const mkProd = (nombre: string) => ds.getRepository(Producto).save(ds.getRepository(Producto).create({ nombre, activo: true, tipo: 'RETAIL' } as any));
  const pizza = await mkProd('PIZZA MUZZARELLA');
  const gaseosa = await mkProd('GASEOSA');
  const lomito = await mkProd('LOMITO');
  const mesa = await ds.getRepository(PdvMesa).save(ds.getRepository(PdvMesa).create({ numero: 1, activo: true } as any));

  // Crea una venta CONCLUIDA con items + un Pago (PAGO efectivo PYG) y setea created_at.
  const mkVenta = async (createdAt: Date, items: Array<{ prod: any; cant: number; pv: number; pc: number }>) => {
    const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'CONCLUIDA', mesa } as any));
    let totalPago = 0;
    for (const it of items) {
      await ds.getRepository(VentaItem).save(ds.getRepository(VentaItem).create({
        venta, producto: it.prod, cantidad: it.cant, precioVentaUnitario: it.pv, precioCostoUnitario: it.pc, estado: 'ACTIVO',
      } as any));
      totalPago += it.cant * it.pv;
    }
    const pago = await ds.getRepository(Pago).save(ds.getRepository(Pago).create({ estado: 'ABIERTO', activo: true } as any));
    await ds.getRepository(PagoDetalle).save(ds.getRepository(PagoDetalle).create({
      valor: totalPago, descripcion: 'PAGO', tipo: 'PAGO', pago, moneda: pyg, formaPago: efectivo, activo: true,
    } as any));
    (venta as any).pago = pago;
    await ds.getRepository(Venta).save(venta);
    // `YYYY-MM-DD HH:MM:SS` UTC: el formato REAL que TypeORM escribe en SQLite.
    // Sellar en ISO hacia pasar el test por la razon equivocada — el ISO tambien
    // estaba de los dos lados de la comparacion, asi que coincidian entre si
    // mientras la app, que guarda el otro formato, devolvia cero.
    await ds.query(`UPDATE ventas SET created_at = ? WHERE id = ?`,
      [createdAt.toISOString().slice(0, 19).replace('T', ' '), venta.id]);
    return { id: venta.id, totalPago };
  };

  const now = new Date();
  // 3 ventas HOY: dos con Pizza+Gaseosa (par), una con Lomito.
  const v1 = await mkVenta(now, [{ prod: pizza, cant: 1, pv: 20000, pc: 8000 }, { prod: gaseosa, cant: 2, pv: 8000, pc: 3000 }]);
  const v2 = await mkVenta(now, [{ prod: pizza, cant: 1, pv: 20000, pc: 8000 }, { prod: gaseosa, cant: 1, pv: 8000, pc: 3000 }]);
  const v3 = await mkVenta(now, [{ prod: lomito, cant: 1, pv: 30000, pc: 12000 }]);
  const facturacionEsperada = v1.totalPago + v2.totalPago + v3.totalPago; // 36000+28000+30000 = 94000

  // ── Reporte del mes SIN comparar ──
  console.log('\n[A] KPIs y secciones (mes actual)');
  const rep = await construirReporteVentasCierre(ds, { rango: 'month', comparar: false });
  ok(rep.kpis.facturacion.valor === facturacionEsperada, 'facturación = suma de PAGO', { got: rep.kpis.facturacion.valor, esperado: facturacionEsperada });
  ok(rep.kpis.tickets.valor === 3, 'tickets = 3', rep.kpis.tickets.valor);
  ok(rep.kpis.ticketPromedio.valor === Math.round(facturacionEsperada / 3), 'ticket promedio', rep.kpis.ticketPromedio.valor);
  ok(rep.kpis.mesas.valor === 1, 'mesas atendidas = 1', rep.kpis.mesas.valor);
  ok(rep.kpis.facturacion.variacion === null, 'sin comparar → variación null');

  console.log('\n[B] Día de semana');
  ok(rep.diaSemana.length === 7, '7 días (Lun..Dom)');
  const totalSemana = rep.diaSemana.reduce((a: number, d: any) => a + d.total, 0);
  ok(totalSemana === facturacionEsperada, 'suma por día = facturación', { totalSemana, facturacionEsperada });

  console.log('\n[C] Top productos + margen');
  const pizzaRow = rep.topProductos.find((p: any) => p.nombre === 'PIZZA MUZZARELLA');
  ok(!!pizzaRow, 'Pizza en top productos');
  ok(pizzaRow.unidades === 2, 'Pizza: 2 unidades', pizzaRow?.unidades);
  ok(pizzaRow.margenPct === 60, 'Pizza margen 60% ((20000-8000)/20000)', pizzaRow?.margenPct);
  const gaseosaRow = rep.topProductos.find((p: any) => p.nombre === 'GASEOSA');
  ok(gaseosaRow.unidades === 3, 'Gaseosa: 3 unidades', gaseosaRow?.unidades);

  console.log('\n[D] Mix de forma de pago');
  ok(rep.mixPago.length === 1 && rep.mixPago[0].nombre === 'EFECTIVO', 'única forma: EFECTIVO');
  ok(rep.mixPago[0].pct === 100, 'EFECTIVO 100%', rep.mixPago[0].pct);

  console.log('\n[E] Combinaciones (market-basket)');
  const par = rep.combinaciones.find((c: any) => c.par.includes('PIZZA') && c.par.includes('GASEOSA'));
  ok(!!par, 'existe el par Pizza+Gaseosa');
  ok(par.frecuencia === 2, 'Pizza+Gaseosa aparece en 2 ventas', par?.frecuencia);

  console.log('\n[F] Tendencia');
  ok(Array.isArray(rep.tendencia.actual) && rep.tendencia.actual.length >= 1, 'serie actual no vacía');
  ok(rep.tendencia.actual.reduce((a: number, b: number) => a + b, 0) === facturacionEsperada, 'suma de la serie = facturación');

  // ── Comparativo: sembrar una venta en el período anterior ──
  console.log('\n[G] Comparativo vs período anterior');
  // La jornada comercial tiene que salir de la MISMA fuente que usa el reporte.
  // Con el default (07:00) y sin pasarla acá, entre las 00:00 y las 06:59 del
  // día 1 el test ubicaba la venta "del mes anterior" un mes más adelante que
  // donde el reporte la busca: `anterior` quedaba vacío y la variación en null.
  // Es una ventana de 7 h por mes — poco frecuente, pero real, y el test no
  // fallaba por el producto sino por mirar un calendario distinto.
  const inicioJornada = await getInicioJornada(ds);
  const periodo = resolverPeriodo({ rango: 'month', comparar: true }, new Date(), inicioJornada);
  const medioAnterior = new Date((periodo.anterior!.desde.getTime() + periodo.anterior!.hasta.getTime()) / 2);
  await mkVenta(medioAnterior, [{ prod: lomito, cant: 1, pv: 30000, pc: 12000 }]); // 30000 el mes anterior
  const rep2 = await construirReporteVentasCierre(ds, { rango: 'month', comparar: true });
  ok(rep2.periodoLabelAnterior != null, 'hay etiqueta de período anterior', rep2.periodoLabelAnterior);
  ok(rep2.kpis.facturacion.variacion !== null, 'variación calculada (no null)');
  // actual 94000 vs anterior 30000 → +213.3%
  ok(rep2.kpis.facturacion.variacion > 0, 'variación positiva (94k vs 30k)', rep2.kpis.facturacion.variacion);
  ok(rep2.kpis.margenPct.esPuntos === true, 'margen: variación en puntos');

  await ds.destroy();
  console.log(`\n✅ REPORTE VENTAS: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[reporte-ventas] FATAL:', e); process.exit(1); });
