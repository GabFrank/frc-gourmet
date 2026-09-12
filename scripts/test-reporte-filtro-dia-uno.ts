#!/usr/bin/env tsx
/**
 * Test E2E: Verificar que el filtro de reportes incluye el día 1 correctamente
 *
 * Problema original (#249): En SQLite, las ventas del día 1 se excluían y las
 * del día 1 del mes siguiente se incluían incorrectamente.
 *
 * Este test verifica que tras el fix:
 * - Venta del día 1 del período → SÍ se incluye
 * - Venta de mitad de mes → SÍ se incluye
 * - Venta del día 1 del mes siguiente → NO se incluye
 */

import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

const ok = (cond: boolean, msg: string, data?: any) => {
  if (!cond) {
    console.error(`❌ ${msg}`, data || '');
    process.exit(1);
  }
  console.log(`✅ ${msg}`);
};

async function main() {
  console.log('Test: Filtro de fecha incluye día 1 correctamente');
  
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-reporte-filtro-dia-uno.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[test-reporte-filtro-dia-uno] Migraciones OK.\n');
  
  try {
    // Crear entidades necesarias usando TypeORM
    const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
    const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
    const { FormasPago } = require('../src/app/database/entities/compras/forma-pago.entity');
    const { Dispositivo } = require('../src/app/database/entities/financiero/dispositivo.entity');
    const { Caja } = require('../src/app/database/entities/financiero/caja.entity');
    const { Conteo } = require('../src/app/database/entities/financiero/conteo.entity');
    const { Pago } = require('../src/app/database/entities/compras/pago.entity');
    const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
    const { PagoDetalle } = require('../src/app/database/entities/compras/pago-detalle.entity');
    
    const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'ADMIN', password: 'x', activo: true } as any));
    const pyg = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true } as any));
    const efectivo = await ds.getRepository(FormasPago).save(ds.getRepository(FormasPago).create({ nombre: 'EFECTIVO', activo: true, movimentaCaja: true } as any));
    const dispositivo = await ds.getRepository(Dispositivo).save(ds.getRepository(Dispositivo).create({ codigo: 'DEV1', nombre: 'Terminal 1', local: true, activo: true } as any));
    const conteoApertura = await ds.getRepository(Conteo).save(ds.getRepository(Conteo).create({} as any));
    const caja = await ds.getRepository(Caja).save(ds.getRepository(Caja).create({ fechaApertura: new Date('2026-08-01T07:00:00'), estado: 'ABIERTO', dispositivo, conteoApertura, activo: true } as any));
    
    // Helper para crear venta + pago con fecha específica
    const mkVenta = async (createdAt: Date, monto: number) => {
      const pago = await ds.getRepository(Pago).save(ds.getRepository(Pago).create({ estado: 'PAGADO', activo: true } as any));
      const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'CONCLUIDA', caja, pago } as any));
      
      // Actualizar created_at con el formato correcto para SQLite
      await ds.query(`UPDATE ventas SET created_at = ? WHERE id = ?`, 
        [createdAt.toISOString().slice(0, 19).replace('T', ' '), venta.id]);
      
      await ds.getRepository(PagoDetalle).save(ds.getRepository(PagoDetalle).create({ 
        pago, valor: monto, tipo: 'PAGO', activo: true, formaPago: efectivo, moneda: pyg, descripcion: 'PAGO TEST' 
      } as any));
      
      return venta;
    };
    
    // Crear 3 ventas en agosto 2026:
    // - Venta A: día 1 (2026-08-01 10:00:00)
    // - Venta B: día 15 (2026-08-15 14:30:00)
    // - Venta C: día 1 del mes siguiente (2026-09-01 09:00:00)
    const fechaA = new Date('2026-08-01T10:00:00');
    const fechaB = new Date('2026-08-15T14:30:00');
    const fechaC = new Date('2026-09-01T09:00:00');
    
    const montoA = 50000;
    const montoB = 75000;
    const montoC = 100000;
    
    const ventaA = await mkVenta(fechaA, montoA);
    const ventaB = await mkVenta(fechaB, montoB);
    const ventaC = await mkVenta(fechaC, montoC);
    
    console.log('\n📊 Ventas creadas:');
    console.log(`  Venta A (día 1 agosto):     ${fechaA.toISOString().slice(0, 19).replace('T', ' ')} → ${montoA} Gs`);
    console.log(`  Venta B (día 15 agosto):    ${fechaB.toISOString().slice(0, 19).replace('T', ' ')} → ${montoB} Gs`);
    console.log(`  Venta C (día 1 septiembre): ${fechaC.toISOString().slice(0, 19).replace('T', ' ')} → ${montoC} Gs`);
    
    // Verificar que las fechas se guardaron en el formato correcto
    const stored: any[] = await ds.query(`SELECT id, created_at FROM ventas ORDER BY id`);
    const formato = (v: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(v));
    ok(formato(stored[0]?.created_at), 'Venta A guarda formato SQLite (YYYY-MM-DD HH:MM:SS)', stored[0]);
    ok(formato(stored[1]?.created_at), 'Venta B guarda formato SQLite', stored[1]);
    ok(formato(stored[2]?.created_at), 'Venta C guarda formato SQLite', stored[2]);
    
    // Importar fechaParamSql dinámicamente
    const { fechaParamSql } = await import('../electron/utils/date.utils');
    
    // Caso 0: CONTRAEJEMPLO - Demostrar que el bug ocurre con toISOString() directo (con T)
    console.log('\n🔬 CONTRAEJEMPLO: Filtro con toISOString() (bug original)');
    const desdeAgosto = new Date(2026, 7, 1, 0, 0, 0, 0); // Agosto = mes 7 (0-indexed)
    const hastaAgosto = new Date(2026, 7, 31, 23, 59, 59, 999);
    
    const desdeBuggy = desdeAgosto.toISOString(); // ❌ Con T: '2026-08-01T00:00:00.000Z'
    const hastaBuggy = hastaAgosto.toISOString(); // ❌ Con T: '2026-08-31T23:59:59.999Z'
    
    console.log(`   String buggy: ${desdeBuggy} - ${hastaBuggy}`);
    ok(desdeBuggy.includes('T'), 'String buggy contiene T (formato ISO con T)', desdeBuggy);
    
    const ventasAgostoBuggy: any[] = await ds.query(
      `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
      [desdeBuggy, hastaBuggy]
    );
    
    // El bug: con T, SQLite compara ' ' < 'T', así que el día 1 se excluye
    console.log(`   Ventas encontradas con bug: ${ventasAgostoBuggy.length} (esperado < 2 por el bug)`);
    ok(!ventasAgostoBuggy.some(v => v.id === ventaA.id), 
       '❌ Con toISOString() (T), venta del día 1 se EXCLUYE (bug #249)', 
       ventasAgostoBuggy.map(v => v.id));
    ok(ventasAgostoBuggy.length < 2,
       `❌ Con toISOString() (T), cuenta ${ventasAgostoBuggy.length} < 2 ventas (falta día 1)`,
       ventasAgostoBuggy.map(v => v.id));
    
    // Caso 1: FIX - Con fechaParamSql el filtro funciona correctamente
    console.log('\n✅ FIX: Filtro con fechaParamSql (normalizado)');
    
    const desdeSQL = fechaParamSql(ds, desdeAgosto);
    const hastaSQL = fechaParamSql(ds, hastaAgosto);
    
    console.log(`   String correcto: ${desdeSQL} - ${hastaSQL}`);
    ok(!desdeSQL.includes('T'), 'String correcto NO contiene T (normalizado para SQLite)', desdeSQL);
    ok(desdeSQL.includes(' '), 'String correcto contiene espacio (formato SQLite)', desdeSQL);
    
    const ventasAgosto: any[] = await ds.query(
      `SELECT id, created_at FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ? ORDER BY id`,
      [desdeSQL, hastaSQL]
    );
    
    console.log(`   Ventas encontradas con fix: ${ventasAgosto.length}`);
    ok(ventasAgosto.length === 2, `✅ Con fechaParamSql, agosto cuenta 2 ventas (A+B), no ${ventasAgosto.length}`, ventasAgosto.map(v => v.id));
    ok(ventasAgosto.some(v => v.id === ventaA.id), '✅ Con fechaParamSql, venta A (día 1) SÍ se incluye');
    ok(ventasAgosto.some(v => v.id === ventaB.id), '✅ Venta B (día 15) SÍ se incluye');
    ok(!ventasAgosto.some(v => v.id === ventaC.id), '✅ Venta C (día 1 sept) NO se incluye en agosto');
    
    // Verificar suma de montos
    const sumaPagos: any[] = await ds.query(`
      SELECT COALESCE(SUM(CASE WHEN pd.tipo = 'PAGO' THEN pd.valor ELSE 0 END), 0)
           - COALESCE(SUM(CASE WHEN pd.tipo = 'VUELTO' THEN pd.valor ELSE 0 END), 0) as total
      FROM ventas v
      JOIN pagos p ON v.pago_id = p.id
      JOIN pagos_detalles pd ON pd.pago_id = p.id AND pd.activo
      WHERE v.estado = 'CONCLUIDA' AND v.created_at >= ? AND v.created_at <= ?
    `, [desdeSQL, hastaSQL]);
    
    const totalAgosto = Number(sumaPagos[0]?.total || 0);
    const esperado = montoA + montoB;
    ok(totalAgosto === esperado, `Total agosto debe ser ${esperado} Gs (A+B), fue ${totalAgosto}`, sumaPagos[0]);
    
    // Caso 2: Reporte de septiembre (01-30)
    const desdeSept = new Date(2026, 8, 1, 0, 0, 0, 0); // Septiembre = mes 8
    const hastaSept = new Date(2026, 8, 30, 23, 59, 59, 999);
    
    const desdeSeptSQL = fechaParamSql(ds, desdeSept);
    const hastaSeptSQL = fechaParamSql(ds, hastaSept);
    
    console.log(`\n🔍 Filtro septiembre: ${desdeSeptSQL} - ${hastaSeptSQL}`);
    
    const ventasSept: any[] = await ds.query(
      `SELECT id, created_at FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ? ORDER BY id`,
      [desdeSeptSQL, hastaSeptSQL]
    );
    
    ok(ventasSept.length === 1, `Septiembre debe contar 1 venta (C), no ${ventasSept.length}`, ventasSept.map(v => v.id));
    ok(ventasSept.some(v => v.id === ventaC.id), 'Venta C (día 1 sept) SÍ se incluye en septiembre');
    ok(!ventasSept.some(v => v.id === ventaA.id), 'Venta A (día 1 agosto) NO se incluye en septiembre');
    ok(!ventasSept.some(v => v.id === ventaB.id), 'Venta B (día 15 agosto) NO se incluye en septiembre');
    
    // Caso 3: Borde de timezone - venta a las 22:00 del 31 de julio
    // Debe INCLUIRSE en julio (es hora local, no UTC)
    const fechaJulio31 = new Date('2026-07-31T22:00:00');
    const ventaD = await mkVenta(fechaJulio31, 25000);
    
    const ventasJulio: any[] = await ds.query(
      `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
      [fechaParamSql(ds, new Date(2026, 6, 1, 0, 0, 0)), fechaParamSql(ds, new Date(2026, 6, 31, 23, 59, 59, 999))]
    );
    ok(ventasJulio.some(v => v.id === ventaD.id), 'Venta 22:00 del 31 julio SÍ se incluye en julio (hora local)');
    
    const ventasAgosto2: any[] = await ds.query(
      `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
      [desdeSQL, hastaSQL]
    );
    ok(!ventasAgosto2.some(v => v.id === ventaD.id), 'Venta 22:00 del 31 julio NO se incluye en agosto');
    
    console.log('\n✅ Test completado exitosamente');
    console.log('   - Día 1 del período se incluye correctamente');
    console.log('   - Día 1 del mes siguiente NO se incluye');
    console.log('   - Borde de timezone funciona con hora local');
    
  } finally {
    await ds.destroy();
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
