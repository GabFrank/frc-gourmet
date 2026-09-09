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
  
  const ds = await createTestDatabase('test-reporte-filtro-dia-uno');
  
  try {
    // Crear usuarios, moneda, caja, etc. (seed mínimo)
    await ds.query(`INSERT INTO usuarios (id, nickname, active, must_change_password, created_at, updated_at) 
                    VALUES (1, 'ADMIN', 1, 0, datetime('now'), datetime('now'))`);
    
    await ds.query(`INSERT INTO monedas (id, nombre, simbolo, denominacion, principal, activo, created_at, updated_at)
                    VALUES (1, 'GUARANÍES', 'Gs', 'PYG', 1, 1, datetime('now'), datetime('now'))`);
    
    await ds.query(`INSERT INTO formas_pago (id, nombre, movimenta_caja, activo, created_at, updated_at)
                    VALUES (1, 'EFECTIVO', 1, 1, datetime('now'), datetime('now'))`);
    
    await ds.query(`INSERT INTO dispositivos (id, codigo, nombre, local, activo, created_at, updated_at, created_by)
                    VALUES (1, 'DEV1', 'Terminal 1', 1, 1, datetime('now'), datetime('now'), 1)`);
    
    await ds.query(`INSERT INTO cajas (id, fecha_apertura, estado, activo, dispositivo_id, created_at, updated_at, created_by)
                    VALUES (1, datetime('2026-08-01 07:00:00'), 'ABIERTO', 1, 1, datetime('now'), datetime('now'), 1)`);
    
    // Crear 3 ventas en agosto 2026:
    // - Venta A: día 1 (2026-08-01 10:00:00)
    // - Venta B: día 15 (2026-08-15 14:30:00)
    // - Venta C: día 1 del mes siguiente (2026-09-01 09:00:00)
    
    const fechaA = '2026-08-01 10:00:00';
    const fechaB = '2026-08-15 14:30:00';
    const fechaC = '2026-09-01 09:00:00';
    
    // Crear pagos y ventas
    for (let i = 1; i <= 3; i++) {
      await ds.query(`INSERT INTO pagos (id, estado, activo, created_at, updated_at, created_by)
                      VALUES (${i}, 'CONCLUIDO', 1, datetime('now'), datetime('now'), 1)`);
    }
    
    const montoA = 50000;
    const montoB = 75000;
    const montoC = 100000;
    
    await ds.query(`INSERT INTO ventas (id, estado, caja_id, pago_id, created_at, updated_at, created_by)
                    VALUES (1, 'CONCLUIDA', 1, 1, ?, datetime('now'), 1)`, [fechaA]);
    await ds.query(`INSERT INTO ventas (id, estado, caja_id, pago_id, created_at, updated_at, created_by)
                    VALUES (2, 'CONCLUIDA', 1, 2, ?, datetime('now'), 1)`, [fechaB]);
    await ds.query(`INSERT INTO ventas (id, estado, caja_id, pago_id, created_at, updated_at, created_by)
                    VALUES (3, 'CONCLUIDA', 1, 3, ?, datetime('now'), 1)`, [fechaC]);
    
    // Crear pagos_detalles
    for (let i = 1; i <= 3; i++) {
      const monto = i === 1 ? montoA : i === 2 ? montoB : montoC;
      await ds.query(`INSERT INTO pagos_detalles (id, pago_id, valor, tipo, activo, forma_pago_id, moneda_id, created_at, updated_at)
                      VALUES (${i}, ${i}, ${monto}, 'PAGO', 1, 1, 1, datetime('now'), datetime('now'))`);
    }
    
    console.log('\n📊 Ventas creadas:');
    console.log(`  Venta A (día 1 agosto):     ${fechaA} → ${montoA} Gs`);
    console.log(`  Venta B (día 15 agosto):    ${fechaB} → ${montoB} Gs`);
    console.log(`  Venta C (día 1 septiembre): ${fechaC} → ${montoC} Gs`);
    
    // Verificar que las fechas se guardaron en el formato correcto
    const stored: any[] = await ds.query(`SELECT id, created_at FROM ventas ORDER BY id`);
    const formato = (v: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(String(v));
    ok(formato(stored[0]?.created_at), 'Venta A guarda formato SQLite (YYYY-MM-DD HH:MM:SS)', stored[0]);
    ok(formato(stored[1]?.created_at), 'Venta B guarda formato SQLite', stored[1]);
    ok(formato(stored[2]?.created_at), 'Venta C guarda formato SQLite', stored[2]);
    
    // Importar fechaParamSql dinámicamente
    const { fechaParamSql } = await import('../electron/utils/date.utils');
    
    // Caso 1: Reporte de agosto completo (01-31)
    const desdeAgosto = new Date(2026, 7, 1, 0, 0, 0, 0); // Agosto = mes 7 (0-indexed)
    const hastaAgosto = new Date(2026, 7, 31, 23, 59, 59, 999);
    
    const desdeSQL = fechaParamSql(ds, desdeAgosto);
    const hastaSQL = fechaParamSql(ds, hastaAgosto);
    
    console.log(`\n🔍 Filtro agosto: ${desdeSQL} - ${hastaSQL}`);
    
    const ventasAgosto: any[] = await ds.query(
      `SELECT id, created_at FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ? ORDER BY id`,
      [desdeSQL, hastaSQL]
    );
    
    ok(ventasAgosto.length === 2, `Agosto debe contar 2 ventas (A+B), no ${ventasAgosto.length}`, ventasAgosto.map(v => v.id));
    ok(ventasAgosto.some(v => v.id === 1), 'Venta A (día 1) SÍ se incluye');
    ok(ventasAgosto.some(v => v.id === 2), 'Venta B (día 15) SÍ se incluye');
    ok(!ventasAgosto.some(v => v.id === 3), 'Venta C (día 1 sept) NO se incluye en agosto');
    
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
    ok(ventasSept.some(v => v.id === 3), 'Venta C (día 1 sept) SÍ se incluye en septiembre');
    ok(!ventasSept.some(v => v.id === 1), 'Venta A (día 1 agosto) NO se incluye en septiembre');
    ok(!ventasSept.some(v => v.id === 2), 'Venta B (día 15 agosto) NO se incluye en septiembre');
    
    // Caso 3: Borde de timezone - venta a las 22:00 del 31 de julio
    // Debe INCLUIRSE en agosto (es hora local, no UTC)
    await ds.query(`INSERT INTO pagos (id, estado, activo, created_at, updated_at, created_by)
                    VALUES (4, 'CONCLUIDO', 1, datetime('now'), datetime('now'), 1)`);
    await ds.query(`INSERT INTO ventas (id, estado, caja_id, pago_id, created_at, updated_at, created_by)
                    VALUES (4, 'CONCLUIDA', 1, 4, '2026-07-31 22:00:00', datetime('now'), 1)`);
    await ds.query(`INSERT INTO pagos_detalles (id, pago_id, valor, tipo, activo, forma_pago_id, moneda_id, created_at, updated_at)
                    VALUES (4, 4, 25000, 'PAGO', 1, 1, 1, datetime('now'), datetime('now'))`);
    
    const ventasJulio: any[] = await ds.query(
      `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
      [fechaParamSql(ds, new Date(2026, 6, 1, 0, 0, 0)), fechaParamSql(ds, new Date(2026, 6, 31, 23, 59, 59, 999))]
    );
    ok(ventasJulio.some(v => v.id === 4), 'Venta 22:00 del 31 julio SÍ se incluye en julio (hora local)');
    
    const ventasAgosto2: any[] = await ds.query(
      `SELECT id FROM ventas WHERE estado = 'CONCLUIDA' AND created_at >= ? AND created_at <= ?`,
      [desdeSQL, hastaSQL]
    );
    ok(!ventasAgosto2.some(v => v.id === 4), 'Venta 22:00 del 31 julio NO se incluye en agosto');
    
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
