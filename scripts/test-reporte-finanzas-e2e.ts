/**
 * E2E: reporte de cierre de mes — Finanzas.
 *
 * Ejercita `construirReporteFinanzasCierre` contra SQLite con migraciones:
 * KPIs (ingresos/egresos/flujo neto/gastos), exclusión de anulaciones,
 * composición de ingresos/egresos, gastos por categoría, aging CPP,
 * comisiones POS y próximos vencimientos.
 *
 * Uso: npm run test:reporte-finanzas
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { construirReporteFinanzasCierre } from '../electron/handlers/reportes-finanzas.helper';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-reporte-finanzas.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[reporte-finanzas] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { FormasPago } = require('../src/app/database/entities/compras/forma-pago.entity');
  const { CajaMayor } = require('../src/app/database/entities/financiero/caja-mayor.entity');
  const { CajaMayorMovimiento } = require('../src/app/database/entities/financiero/caja-mayor-movimiento.entity');
  const { GastoCategoria } = require('../src/app/database/entities/financiero/gasto-categoria.entity');
  const { Gasto } = require('../src/app/database/entities/financiero/gasto.entity');
  const { MaquinaPos } = require('../src/app/database/entities/financiero/maquina-pos.entity');
  const { AcreditacionPos } = require('../src/app/database/entities/financiero/acreditacion-pos.entity');
  const { CuentaPorPagar } = require('../src/app/database/entities/financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = require('../src/app/database/entities/financiero/cuenta-por-pagar-cuota.entity');

  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const pyg = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: '₲', principal: true, decimales: 0, activo: true } as any));
  const efectivo = await ds.getRepository(FormasPago).save(ds.getRepository(FormasPago).create({ nombre: 'EFECTIVO', activo: true, movimentaCaja: true } as any));
  const cm = await ds.getRepository(CajaMayor).save(ds.getRepository(CajaMayor).create({ nombre: 'CM', estado: 'ABIERTA', fechaApertura: new Date(), responsable: admin, activo: true } as any));

  const now = new Date();
  const mkMov = (tipo: string, monto: number, extra: any = {}) => ds.getRepository(CajaMayorMovimiento).save(ds.getRepository(CajaMayorMovimiento).create({
    cajaMayor: cm, moneda: pyg, formaPago: efectivo, tipoMovimiento: tipo, monto, fecha: now, responsable: admin, ...extra,
  } as any));

  // Ingresos: 100.000 + 50.000 = 150.000
  await mkMov('INGRESO_COBRO_CLIENTE', 100000);
  await mkMov('INGRESO_RETIRO_BANCO', 50000);
  // Egresos: 40.000 (gasto) + 60.000 (salario) = 100.000
  await mkMov('EGRESO_GASTO', 40000);
  await mkMov('EGRESO_SALARIO', 60000);
  // Anulación: un ingreso grande + su contra (debe EXCLUIRSE del neto)
  const orig = await mkMov('INGRESO_COBRO_CLIENTE', 999999);
  await mkMov('ANULACION', 999999, { referenciaAnulacion: orig });

  // Gastos por categoría (tabla gastos)
  const catInsumos = await ds.getRepository(GastoCategoria).save(ds.getRepository(GastoCategoria).create({ nombre: 'INSUMOS', activo: true } as any));
  const catServicios = await ds.getRepository(GastoCategoria).save(ds.getRepository(GastoCategoria).create({ nombre: 'SERVICIOS', activo: true } as any));
  const mkGasto = (cat: any, monto: number) => ds.getRepository(Gasto).save(ds.getRepository(Gasto).create({
    descripcion: 'G', monto, fecha: now, gastoCategoria: cat, cajaMayor: cm, moneda: pyg, estado: 'PAGADO', destinoTipo: 'CAJA_MAYOR',
  } as any));
  await mkGasto(catInsumos, 30000);
  await mkGasto(catServicios, 10000);

  // Comisiones POS
  const maq = await ds.getRepository(MaquinaPos).save(ds.getRepository(MaquinaPos).create({ nombre: 'BANCARD', porcentajeComision: 2.5, activo: true } as any));
  await ds.getRepository(AcreditacionPos).save(ds.getRepository(AcreditacionPos).create({
    maquinaPos: maq, montoOriginal: 200000, montoComision: 5000, montoEsperado: 195000, estado: 'ACREDITADO_AUTO',
    fechaTransaccion: now, fechaEsperadaAcreditacion: now,
  } as any));

  // CPP: una cuota vencida (-40 días, 20.000) y una por vencer (+10 días, 12.000)
  const cpp = await ds.getRepository(CuentaPorPagar).save(ds.getRepository(CuentaPorPagar).create({
    tipo: 'COMPRA', descripcion: 'COMPRA HELADERA', montoTotal: 32000, montoPagado: 0, moneda: pyg, fechaInicio: now, cantidadCuotas: 2, estado: 'ACTIVO',
  } as any));
  const dstr = (offsetDias: number) => { const d = new Date(now); d.setDate(d.getDate() + offsetDias); return d.toISOString().slice(0, 10); };
  await ds.getRepository(CuentaPorPagarCuota).save(ds.getRepository(CuentaPorPagarCuota).create({ numero: 1, fechaVencimiento: dstr(-40), monto: 20000, montoPagado: 0, estado: 'PENDIENTE', cuentaPorPagar: cpp } as any));
  await ds.getRepository(CuentaPorPagarCuota).save(ds.getRepository(CuentaPorPagarCuota).create({ numero: 2, fechaVencimiento: dstr(10), monto: 12000, montoPagado: 0, estado: 'PENDIENTE', cuentaPorPagar: cpp } as any));

  // ── Reporte ──
  const rep = await construirReporteFinanzasCierre(ds, { rango: 'month', comparar: false });

  console.log('\n[A] KPIs de flujo');
  ok(rep.kpis.ingresos.valor === 150000, 'ingresos = 150.000 (anulación excluida)', rep.kpis.ingresos.valor);
  ok(rep.kpis.egresos.valor === 100000, 'egresos = 100.000', rep.kpis.egresos.valor);
  ok(rep.kpis.flujoNeto.valor === 50000, 'flujo neto = 50.000', rep.kpis.flujoNeto.valor);
  ok(rep.kpis.gastos.valor === 40000, 'gastos = 40.000', rep.kpis.gastos.valor);
  ok(rep.kpis.egresos.invertido === true, 'egresos: baja = buena (invertido)');

  console.log('\n[B] Composición de egresos');
  const cEg = rep.composicionEgresos;
  ok(cEg.some((x: any) => x.nombre === 'Gastos operativos' && x.total === 40000), 'incluye Gastos operativos (40.000)', cEg);
  ok(cEg.some((x: any) => x.nombre === 'Salarios' && x.total === 60000), 'incluye Salarios (60.000)');

  console.log('\n[C] Gastos por categoría');
  const gc = rep.gastosPorCategoria;
  ok(gc.find((x: any) => x.nombre === 'INSUMOS')?.total === 30000, 'INSUMOS 30.000', gc);
  ok(gc.find((x: any) => x.nombre === 'SERVICIOS')?.total === 10000, 'SERVICIOS 10.000');

  console.log('\n[D] Aging CPP');
  ok(rep.aging.porPagar.total === 32000, 'por pagar total = 32.000', rep.aging.porPagar.total);
  ok(rep.aging.porPagar.buckets[0] === 12000, 'por vencer = 12.000 (+10 días)', rep.aging.porPagar.buckets);
  ok(rep.aging.porPagar.buckets[2] === 20000, '31–60 días = 20.000 (-40 días)', rep.aging.porPagar.buckets);
  ok(rep.aging.porCobrar.total === 0, 'por cobrar = 0 (sin CPC)');

  console.log('\n[E] Comisiones POS');
  ok(rep.comisionesPos.total === 5000, 'comisión total = 5.000', rep.comisionesPos.total);
  ok(rep.comisionesPos.facturado === 200000, 'facturado = 200.000');
  ok(rep.comisionesPos.pctPromedio === 2.5, '% promedio = 2,5%', rep.comisionesPos.pctPromedio);
  ok(rep.comisionesPos.porMaquina[0].nombre === 'BANCARD', 'máquina BANCARD');

  console.log('\n[F] Próximos vencimientos');
  ok(rep.vencimientos.length === 1, '1 vencimiento en 30 días (la cuota +10)', rep.vencimientos.length);
  ok(rep.vencimientos[0].tipo === 'CPP', 'tipo CPP');
  ok(rep.totalComprometido === 12000, 'total comprometido = 12.000', rep.totalComprometido);

  console.log('\n[G] Flujo de caja (series)');
  ok(Array.isArray(rep.flujoCaja.ingresos) && rep.flujoCaja.ingresos.length >= 1, 'serie de ingresos no vacía');
  ok(rep.flujoCaja.ingresos.reduce((a: number, b: number) => a + b, 0) === 150000, 'suma ingresos serie = 150.000');
  ok(rep.flujoCaja.egresos.reduce((a: number, b: number) => a + b, 0) === 100000, 'suma egresos serie = 100.000');

  await ds.destroy();
  console.log(`\n✅ REPORTE FINANZAS: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[reporte-finanzas] FATAL:', e); process.exit(1); });
