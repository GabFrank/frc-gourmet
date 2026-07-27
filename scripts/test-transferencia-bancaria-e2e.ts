/**
 * E2E: transferencia bancaria (banco → banco) vía OperacionFinanciera.
 *
 * Ejercita los handlers REALES `create-operacion-financiera` y
 * `anular-operacion-financiera` contra SQLite (migraciones incluidas), validando
 * el tipo nuevo TRANSFERENCIA_BANCARIA:
 *  - misma moneda: débito exacto en origen, crédito exacto en destino,
 *  - distinta moneda (con cotización): montoDestino independiente del origen,
 *  - NO genera movimientos de Caja Mayor (solo saldos bancarios + MovimientoBancario),
 *  - anulación: revierte AMBAS cuentas,
 *  - guardas: misma cuenta origen/destino y cuenta inexistente → error.
 *
 * Uso: npm run test:transferencia-bancaria
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
  const dbFile = path.join(tmpDir, 'test-transferencia-bancaria.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[transferencia-bancaria] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { CuentaBancaria } = require('../src/app/database/entities/financiero/cuenta-bancaria.entity');
  const { OperacionFinanciera } = require('../src/app/database/entities/financiero/operacion-financiera.entity');
  const { CajaMayorMovimiento } = require('../src/app/database/entities/financiero/caja-mayor-movimiento.entity');
  const { MovimientoBancario } = require('../src/app/database/entities/financiero/movimiento-bancario.entity');

  // Seed: admin con permiso CAJA_MAYOR_OPERAR
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'CAJA_MAYOR_OPERAR', descripcion: 'CM', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  // Monedas: PYG (principal, 0 dec) y BRL (2 dec)
  const pyg = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: '₲', principal: true, decimales: 0, activo: true } as any));
  const brl = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'REAL', simbolo: 'R$', principal: false, decimales: 2, activo: true } as any));

  // Cuentas bancarias
  const mkCuenta = (nombre: string, moneda: any, saldo: number) => ds.getRepository(CuentaBancaria).save(ds.getRepository(CuentaBancaria).create({
    nombre, banco: 'BANCO ' + nombre, numeroCuenta: '000-' + nombre, tipoCuenta: 'CORRIENTE', moneda, saldo, saldoReservado: 0, activo: true,
  } as any));
  const bancoA = await mkCuenta('A', pyg, 1_000_000); // ₲ 1.000.000
  const bancoB = await mkCuenta('B', pyg, 200_000);   // ₲ 200.000
  const bancoBRL = await mkCuenta('BRL', brl, 500);   // R$ 500

  registerCajaMayorHandlers(ds, () => admin);

  const saldoDe = async (id: number): Promise<number> => {
    const cb = await ds.getRepository(CuentaBancaria).findOne({ where: { id } });
    return Number((cb as any).saldo);
  };
  const cmMovsDeOp = async (opId: number): Promise<number> => {
    return ds.getRepository(CajaMayorMovimiento).count({ where: { operacionFinancieraId: opId } });
  };
  const bancoMovsDeCuenta = async (cbId: number): Promise<number> => {
    return ds.getRepository(MovimientoBancario).count({ where: { cuentaBancaria: { id: cbId } } as any });
  };

  // ─────────────── Caso 1: misma moneda (₲ A → ₲ B, 300.000) ───────────────
  console.log('\n[1] Transferencia misma moneda (₲ A → ₲ B, 300.000)');
  const op1 = await invokeHandlerWithContext('create-operacion-financiera', undefined, {
    tipoOperacion: 'TRANSFERENCIA_BANCARIA',
    descripcion: 'transf misma moneda',
    fecha: new Date(),
    cuentaBancariaOrigenId: bancoA.id, monedaOrigenId: pyg.id, montoOrigen: 300_000,
    cuentaBancariaDestinoId: bancoB.id, monedaDestinoId: pyg.id, montoDestino: 300_000,
  });
  ok(!!op1?.id, 'op1 creada');
  ok(await saldoDe(bancoA.id) === 700_000, 'A: 1.000.000 - 300.000 = 700.000', await saldoDe(bancoA.id));
  ok(await saldoDe(bancoB.id) === 500_000, 'B: 200.000 + 300.000 = 500.000', await saldoDe(bancoB.id));
  ok(await cmMovsDeOp(op1.id) === 0, 'NO generó movimientos de Caja Mayor');
  ok(await bancoMovsDeCuenta(bancoA.id) === 1, 'A: 1 MovimientoBancario (SALIDA)');
  ok(await bancoMovsDeCuenta(bancoB.id) === 1, 'B: 1 MovimientoBancario (ENTRADA)');

  // ─────────────── Caso 2: distinta moneda (₲ A → R$ BRL) ──────────────────
  // montoOrigen ₲ 600.000, cotización 1500 (₲ por R$) → montoDestino R$ 400.
  console.log('\n[2] Transferencia multi-moneda (₲ A → R$ BRL, 600.000 → R$ 400)');
  const op2 = await invokeHandlerWithContext('create-operacion-financiera', undefined, {
    tipoOperacion: 'TRANSFERENCIA_BANCARIA',
    descripcion: 'transf multimoneda',
    fecha: new Date(),
    cuentaBancariaOrigenId: bancoA.id, monedaOrigenId: pyg.id, montoOrigen: 600_000,
    cuentaBancariaDestinoId: bancoBRL.id, monedaDestinoId: brl.id, montoDestino: 400, cotizacion: 1500,
  });
  ok(!!op2?.id, 'op2 creada');
  ok(await saldoDe(bancoA.id) === 100_000, 'A: 700.000 - 600.000 = 100.000', await saldoDe(bancoA.id));
  ok(await saldoDe(bancoBRL.id) === 900, 'BRL: 500 + 400 = 900', await saldoDe(bancoBRL.id));
  ok(await cmMovsDeOp(op2.id) === 0, 'NO generó movimientos de Caja Mayor');

  // ─────────────── Caso 3: anular op1 revierte ambas cuentas ───────────────
  console.log('\n[3] Anular op1 (misma moneda) revierte ambas cuentas');
  await invokeHandlerWithContext('anular-operacion-financiera', undefined, op1.id, 'PRUEBA');
  ok(await saldoDe(bancoA.id) === 400_000, 'A: 100.000 + 300.000 devueltos = 400.000', await saldoDe(bancoA.id));
  ok(await saldoDe(bancoB.id) === 200_000, 'B: 500.000 - 300.000 = 200.000 (vuelve al inicial)', await saldoDe(bancoB.id));
  const op1row = await ds.getRepository(OperacionFinanciera).findOne({ where: { id: op1.id } });
  ok((op1row as any).anulado === true, 'op1 marcada anulada');
  // Doble anulación → error (idempotencia)
  let threwDoble = false;
  try { await invokeHandlerWithContext('anular-operacion-financiera', undefined, op1.id, 'OTRA'); } catch { threwDoble = true; }
  ok(threwDoble, 'anular dos veces la misma op → error');

  // ─────────────── Caso 4: guardas ─────────────────────────────────────────
  console.log('\n[4] Guardas');
  let threwMismaCuenta = false;
  try {
    await invokeHandlerWithContext('create-operacion-financiera', undefined, {
      tipoOperacion: 'TRANSFERENCIA_BANCARIA', descripcion: 'misma cuenta', fecha: new Date(),
      cuentaBancariaOrigenId: bancoA.id, monedaOrigenId: pyg.id, montoOrigen: 1000,
      cuentaBancariaDestinoId: bancoA.id, monedaDestinoId: pyg.id, montoDestino: 1000,
    });
  } catch { threwMismaCuenta = true; }
  ok(threwMismaCuenta, 'origen == destino → error');

  let threwInexistente = false;
  try {
    await invokeHandlerWithContext('create-operacion-financiera', undefined, {
      tipoOperacion: 'TRANSFERENCIA_BANCARIA', descripcion: 'cuenta inexistente', fecha: new Date(),
      cuentaBancariaOrigenId: 99999, monedaOrigenId: pyg.id, montoOrigen: 1000,
      cuentaBancariaDestinoId: bancoB.id, monedaDestinoId: pyg.id, montoDestino: 1000,
    });
  } catch { threwInexistente = true; }
  ok(threwInexistente, 'cuenta origen inexistente → error');
  // El saldo de A no cambió por los intentos fallidos (transacción con rollback).
  ok(await saldoDe(bancoA.id) === 400_000, 'A intacta tras intentos fallidos (rollback)', await saldoDe(bancoA.id));

  await ds.destroy();
  console.log(`\n✅ TRANSFERENCIA_BANCARIA: ${passed} OK, ${failed} fallos.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[transferencia-bancaria] FATAL:', e); process.exit(1); });
