/**
 * E2E: el resumen financiero del funcionario convierte a la moneda principal.
 *
 * Un vale de 460 BRL debe reflejarse como 460 en su vencimiento (moneda real)
 * pero sumar 460 * cotización en el total (PYG). Antes se sumaba 460 crudo.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-resumen-multimoneda-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerRrhhFuncionariosHandlers } from '../electron/handlers/rrhh-funcionarios.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function approx(a: number, b: number): boolean { return Math.abs(Number(a) - Number(b)) < 0.01; }

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-resumen-multimoneda.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[resumen-multimoneda] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Vale } = E('rrhh/vale.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');

  const save = <T>(cls: any, data: any): Promise<T> => ds.getRepository(cls).save(ds.getRepository(cls).create(data));

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  registerRrhhFuncionariosHandlers(ds, () => admin);

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const brl: any = await save(Moneda, { denominacion: 'REAL', simbolo: 'Rs', principal: false, activo: true });
  // Cotización BRL → PYG: 1 Rs = 1400 Gs
  await save(MonedaCambio, {
    monedaOrigen: brl, monedaDestino: pyg, compraOficial: 1400, ventaOficial: 1400, compraLocal: 1400, ventaLocal: 1400, activo: true,
  });

  const cargo: any = await save(Cargo, { nombre: 'MOZO', activo: true });
  const persona: any = await save(Persona, { nombre: 'JOAO', apellido: 'SILVA', activo: true });
  const func: any = await save(Funcionario, {
    persona, cargo, fechaIngreso: '2025-01-01', salarioBase: 2500000, monedaSalario: pyg, activo: true, ipsActivo: false, esJornalero: false,
  });
  // Vale de 460 BRL
  await save(Vale, { funcionario: func, monto: 460, fecha: '2026-07-01', moneda: brl, estado: 'CONFIRMADO', esAdelanto: false });

  console.log('\n[A] Resumen financiero convierte a la moneda principal');
  const resumen = await invokeHandlerWithContext('get-funcionario-resumen-financiero', undefined, func.id);
  ok(resumen.monedaPrincipalSimbolo === 'Gs', 'moneda principal = Gs', resumen.monedaPrincipalSimbolo);
  ok(approx(resumen.vales.total, 644000), 'vale de 460 Rs suma 644.000 Gs en el total (460 x 1400)', resumen.vales.total);
  ok(approx(resumen.totalAdeudado, 644000), 'totalAdeudado en Gs = 644.000', resumen.totalAdeudado);
  ok(resumen.sinCotizacion === false, 'sinCotizacion=false (había cotización)', resumen.sinCotizacion);

  // Sin cotización: un vale en una moneda sin cambio registrado marca sinCotizacion
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'US$', principal: false, activo: true });
  await save(Vale, { funcionario: func, monto: 100, fecha: '2026-07-02', moneda: usd, estado: 'CONFIRMADO', esAdelanto: false });
  const resumen2 = await invokeHandlerWithContext('get-funcionario-resumen-financiero', undefined, func.id);
  ok(resumen2.sinCotizacion === true, 'vale en USD sin cotización marca sinCotizacion=true', resumen2.sinCotizacion);
  ok(approx(resumen2.vales.total, 644000), 'total sigue en 644.000 (USD sin cotización no se suma crudo)', resumen2.vales.total);

  await ds.destroy();
  console.log(`\n[resumen-multimoneda] Resultado: ${passed} OK, ${failed} FALLARON.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
