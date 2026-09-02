/**
 * E2E: configuración de Caja Mayor — orden de cuentas + preservación de FPs.
 *
 * Ejercita los handlers REALES `save-caja-mayor-configuracion` y
 * `get-caja-mayor-configuracion` contra SQLite (migraciones incluidas):
 *  - persiste el ORDEN de las cuentas bancarias (drag & drop) en
 *    `cuentasBancariasOrden` y lo devuelve al leer,
 *  - al guardar SIN `formaPagoIds` (el diálogo ya no muestra la sección),
 *    preserva las formas de pago visibles previas (no vacía la M:M),
 *  - al guardar CON `formaPagoIds`, las reemplaza.
 *
 * Uso: npm run test:config-caja-mayor
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-config-caja-mayor.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[config-caja-mayor] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { CuentaBancaria } = require('../src/app/database/entities/financiero/cuenta-bancaria.entity');
  const { CajaMayor } = require('../src/app/database/entities/financiero/caja-mayor.entity');
  const { FormasPago } = require('../src/app/database/entities/compras/forma-pago.entity');

  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  // `save-caja-mayor-configuracion` exige CAJA_MAYOR_OPERAR desde la auditoría de
  // permisos de 2026-07; este test nunca se actualizó y fallaba con FORBIDDEN.
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const permCm: any = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'CAJA_MAYOR_OPERAR', descripcion: 'OPERAR', activo: true } as any));
  const rolCm: any = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role: rolCm, permission: permCm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role: rolCm } as any));
  const pyg = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: '₲', principal: true, decimales: 0, activo: true } as any));
  const caja = await ds.getRepository(CajaMayor).save(ds.getRepository(CajaMayor).create({ nombre: 'CM CENTRO', estado: 'ABIERTA', fechaApertura: new Date(), responsable: admin, activo: true } as any));

  const fpEfectivo = await ds.getRepository(FormasPago).save(ds.getRepository(FormasPago).create({ nombre: 'EFECTIVO', activo: true, movimentaCaja: true } as any));
  const fpTransf = await ds.getRepository(FormasPago).save(ds.getRepository(FormasPago).create({ nombre: 'TRANSFERENCIA', activo: true, movimentaCaja: false } as any));

  const mkCuenta = (nombre: string) => ds.getRepository(CuentaBancaria).save(ds.getRepository(CuentaBancaria).create({
    nombre, banco: 'BANCO ' + nombre, numeroCuenta: '000-' + nombre, tipoCuenta: 'CORRIENTE', moneda: pyg, saldo: 0, saldoReservado: 0, activo: true,
  } as any));
  const b1 = await mkCuenta('UNO');
  const b2 = await mkCuenta('DOS');
  const b3 = await mkCuenta('TRES');

  registerCajaMayorHandlers(ds, () => admin);

  // ── 1) Primer guardado: FPs = [efectivo], orden de cuentas = [b2, b3, b1] ──
  console.log('\n[1] Guardar con formaPagoIds + orden de cuentas [b2,b3,b1]');
  await invokeHandlerWithContext('save-caja-mayor-configuracion', undefined, caja.id, {
    formaPagoIds: [fpEfectivo.id],
    cuentaBancariaIds: [b2.id, b3.id, b1.id],
    mostrarCuentasPorPagar: true,
    mostrarCuentasPorCobrar: false,
  });
  let cfg = await invokeHandlerWithContext('get-caja-mayor-configuracion', undefined, caja.id);
  const orden1 = JSON.parse(cfg.cuentasBancariasOrden || '[]');
  ok(JSON.stringify(orden1) === JSON.stringify([b2.id, b3.id, b1.id]), 'orden persistido = [b2,b3,b1]', orden1);
  ok((cfg.formasPagoVisibles || []).length === 1 && cfg.formasPagoVisibles[0].id === fpEfectivo.id, 'FP visible = [efectivo]');
  ok((cfg.cuentasBancariasVisibles || []).length === 3, 'M:M cuentas visibles = 3');
  ok(cfg.mostrarCuentasPorPagar === true, 'mostrarCPP = true');

  // ── 2) Segundo guardado SIN formaPagoIds: preserva FPs, cambia orden ──────
  console.log('\n[2] Guardar SIN formaPagoIds (diálogo nuevo) → preserva FPs, reordena [b1,b2,b3]');
  await invokeHandlerWithContext('save-caja-mayor-configuracion', undefined, caja.id, {
    cuentaBancariaIds: [b1.id, b2.id, b3.id],
    mostrarCuentasPorPagar: true,
    mostrarCuentasPorCobrar: true,
  });
  cfg = await invokeHandlerWithContext('get-caja-mayor-configuracion', undefined, caja.id);
  const orden2 = JSON.parse(cfg.cuentasBancariasOrden || '[]');
  ok(JSON.stringify(orden2) === JSON.stringify([b1.id, b2.id, b3.id]), 'nuevo orden = [b1,b2,b3]', orden2);
  ok((cfg.formasPagoVisibles || []).length === 1 && cfg.formasPagoVisibles[0].id === fpEfectivo.id,
    'FP visible PRESERVADA (no se vació al omitir formaPagoIds)', (cfg.formasPagoVisibles || []).map((f: any) => f.id));
  ok(cfg.mostrarCuentasPorCobrar === true, 'mostrarCPC ahora true');

  // ── 3) Guardar CON formaPagoIds explícito reemplaza ──────────────────────
  console.log('\n[3] Guardar CON formaPagoIds explícito reemplaza las FPs');
  await invokeHandlerWithContext('save-caja-mayor-configuracion', undefined, caja.id, {
    formaPagoIds: [fpTransf.id],
    cuentaBancariaIds: [b1.id],
  });
  cfg = await invokeHandlerWithContext('get-caja-mayor-configuracion', undefined, caja.id);
  ok((cfg.formasPagoVisibles || []).length === 1 && cfg.formasPagoVisibles[0].id === fpTransf.id, 'FP reemplazada por [transferencia]');
  ok(JSON.parse(cfg.cuentasBancariasOrden || '[]').length === 1, 'orden ahora = [b1]');

  await ds.destroy();
  console.log(`\n✅ CONFIG CAJA MAYOR: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[config-caja-mayor] FATAL:', e); process.exit(1); });
