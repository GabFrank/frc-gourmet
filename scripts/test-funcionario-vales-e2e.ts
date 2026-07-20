/**
 * E2E: funcionario que también es cliente — impacto en liquidaciones.
 *
 * Ejercita los handlers REALES contra SQLite, validando:
 *  A) Liquidación de sueldo descuenta el consumo a crédito (CPC) del funcionario:
 *     - generar-liquidacion-borrador crea el item CREDITO_CONSUMO,
 *     - pagar cobra la cuota CPC (saldoActual baja, MovimientoCliente PAGO),
 *     - anular revierte el cobro.
 *  B) Liquidación final netea deudas en prioridad (vale -> préstamo -> crédito),
 *     con neto topado en 0 y residual abierto.
 *  C) Handlers de resumen financiero y vínculo cliente->funcionario.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-funcionario-vales-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerLiquidacionSueldoHandlers, seedLiquidacionConceptos } from '../electron/handlers/liquidacion-sueldo.handler';
import { registerLiquidacionFinalHandlers } from '../electron/handlers/liquidacion-final.handler';
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
  const dbFile = path.join(tmpDir, 'test-funcionario-vales.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[funcionario-vales] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { TipoCliente } = E('personas/tipo-cliente.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Vale } = E('rrhh/vale.entity');
  const { LiquidacionSueldo } = E('rrhh/liquidacion-sueldo.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');
  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const { CuentaPorPagar } = E('financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = E('financiero/cuenta-por-pagar-cuota.entity');

  const save = <T>(cls: any, data: any): Promise<T> => ds.getRepository(cls).save(ds.getRepository(cls).create(data));

  // ---- Seed permisos + admin ----
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  await save(UsuarioRole, { usuario: admin, role });
  for (const codigo of ['RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR', 'RRHH_LIQUIDACION_PAGAR', 'RRHH_LIQUIDACION_FINAL_GENERAR']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role, permission: perm });
  }

  await seedLiquidacionConceptos(ds);
  registerLiquidacionSueldoHandlers(ds, () => admin);
  registerLiquidacionFinalHandlers(ds, () => admin);
  registerRrhhFuncionariosHandlers(ds, () => admin);

  // ---- Seed base ----
  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const tipoCli: any = await save(TipoCliente, { descripcion: 'CONVENIADO', activo: true, credito: true });
  const cargo: any = await save(Cargo, { nombre: 'MOZO', activo: true });
  const caja: any = await save(CajaMayor, { nombre: 'CAJA CENTRAL', estado: 'ABIERTA', fechaApertura: new Date(), activo: true });
  const formaPago: any = await save(FormasPago, { nombre: 'EFECTIVO', movimentaCaja: true, activo: true });

  // Funcionario A que también es cliente (misma persona)
  const personaA: any = await save(Persona, { nombre: 'JUAN', apellido: 'PEREZ', activo: true });
  const funcA: any = await save(Funcionario, {
    persona: personaA, cargo, fechaIngreso: '2024-01-01', salarioBase: 2500000,
    monedaSalario: pyg, activo: true, ipsActivo: false, esJornalero: false,
  });
  const cliA: any = await save(Cliente, { persona: personaA, tipo_cliente: tipoCli, credito: true, limite_credito: 1000000, saldoActual: 100000 });

  // CPC: consumo a crédito 100.000, 1 cuota que vence en 2026-07
  const cpcA: any = await save(CuentaPorCobrar, {
    cliente: cliA, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO LOCAL', montoTotal: 100000, montoCobrado: 0,
    cantidadCuotas: 1, fechaInicio: '2026-07-01', moneda: pyg, estado: 'ACTIVO',
  });
  const cuotaA: any = await save(CuentaPorCobrarCuota, {
    cuentaPorCobrar: cpcA, numero: 1, fechaVencimiento: '2026-07-15', monto: 100000, montoCobrado: 0, estado: 'PENDIENTE',
  });

  // ===== TEST A: sueldo descuenta CPC =====
  console.log('\n[A] Liquidación de sueldo descuenta consumo a crédito');
  const liqA = await invokeHandlerWithContext('generar-liquidacion-borrador', undefined, { funcionarioId: funcA.id, periodo: '2026-07', monedaPagoId: pyg.id });
  let detA = await invokeHandlerWithContext('get-liquidacion-sueldo', undefined, liqA.id);
  const itemCpc = (detA.items || []).find((i: any) => i.referenciaTipo === 'CPC_CUOTA');
  ok(!!itemCpc, 'genera item de descuento CPC_CUOTA', detA.items?.map((i: any) => i.referenciaTipo));
  ok(itemCpc && itemCpc.concepto?.codigo === 'CREDITO_CONSUMO', 'concepto CREDITO_CONSUMO', itemCpc?.concepto?.codigo);
  ok(itemCpc && approx(itemCpc.monto, 100000), 'monto del descuento = 100.000', itemCpc?.monto);
  ok(approx(detA.totalDescuentos, 100000), 'totalDescuentos incluye el crédito', detA.totalDescuentos);
  ok(approx(detA.totalNeto, 2400000), 'neto = 2.500.000 - 100.000', detA.totalNeto);

  await invokeHandlerWithContext('aprobar-liquidacion-sueldo', undefined, liqA.id);
  await invokeHandlerWithContext('pagar-liquidacion-sueldo', undefined, liqA.id, { fuente: 'CAJA_MAYOR', cajaMayorId: caja.id, monedaId: pyg.id, formaPagoId: formaPago.id });

  const cuotaApos: any = await ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id: cuotaA.id } });
  ok(cuotaApos.estado === 'COBRADO', 'cuota CPC quedó COBRADO al pagar', cuotaApos.estado);
  const cliApos: any = await ds.getRepository(Cliente).findOne({ where: { id: cliA.id } });
  ok(approx(cliApos.saldoActual, 0), 'saldoActual del cliente bajó a 0', cliApos.saldoActual);
  const movsPago = await ds.getRepository(MovimientoCliente).find({ where: { cuentaPorCobrarCuotaId: cuotaA.id, tipo: 'PAGO' } });
  ok(movsPago.length === 1, 'se creó 1 MovimientoCliente PAGO', movsPago.length);

  await invokeHandlerWithContext('anular-liquidacion-sueldo', undefined, liqA.id, 'test');
  const cuotaAnul: any = await ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id: cuotaA.id } });
  ok(cuotaAnul.estado === 'PENDIENTE', 'al anular, cuota CPC vuelve a PENDIENTE', cuotaAnul.estado);
  const cliAnul: any = await ds.getRepository(Cliente).findOne({ where: { id: cliA.id } });
  ok(approx(cliAnul.saldoActual, 100000), 'al anular, saldoActual del cliente se restaura', cliAnul.saldoActual);
  const movsAnul = await ds.getRepository(MovimientoCliente).find({ where: { cuentaPorCobrarCuotaId: cuotaA.id, tipo: 'PAGO' } });
  ok(movsAnul.length === 0, 'al anular, se borró el MovimientoCliente PAGO', movsAnul.length);

  // ===== TEST B: liquidación final netea deudas =====
  console.log('\n[B] Liquidación final netea deudas (prioridad + neto topado en 0)');
  const personaB: any = await save(Persona, { nombre: 'MARIA', apellido: 'GOMEZ', activo: true });
  const funcB: any = await save(Funcionario, {
    persona: personaB, cargo, fechaIngreso: '2025-06-01', salarioBase: 1200000,
    monedaSalario: pyg, activo: true, ipsActivo: false, esJornalero: false,
  });
  const cliB: any = await save(Cliente, { persona: personaB, tipo_cliente: tipoCli, credito: true, limite_credito: 1000000, saldoActual: 60000 });

  // Haberes = aguinaldo proporcional: 1 liquidación APROBADA 2026 con haberes 1.200.000 -> aguinaldo 100.000
  await save(LiquidacionSueldo, {
    funcionario: funcB, periodo: '2026-01', fechaInicio: '2026-01-01', fechaFin: '2026-01-31',
    salarioBase: 1200000, totalHaberes: 1200000, totalDescuentos: 0, totalNeto: 1200000, monedaPago: pyg, estado: 'APROBADA',
  });

  // Deudas: vale 50.000 + cuota préstamo 80.000 + cuota crédito 60.000 = 190.000 (> 100.000 haberes)
  await save(Vale, { funcionario: funcB, monto: 50000, fecha: '2026-03-01', moneda: pyg, estado: 'CONFIRMADO', esAdelanto: false });
  const cppB: any = await save(CuentaPorPagar, {
    descripcion: 'PRESTAMO FUNCIONARIO', tipo: 'PRESTAMO_FUNCIONARIO', funcionario: funcB, montoTotal: 80000, montoPagado: 0,
    moneda: pyg, fechaInicio: '2026-05-01', cantidadCuotas: 1, estado: 'ACTIVO',
  });
  const cuotaCppB: any = await save(CuentaPorPagarCuota, { cuentaPorPagar: cppB, numero: 1, fechaVencimiento: '2026-06-01', monto: 80000, montoPagado: 0, estado: 'PENDIENTE' });
  const cpcB: any = await save(CuentaPorCobrar, {
    cliente: cliB, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO', montoTotal: 60000, montoCobrado: 0,
    cantidadCuotas: 1, fechaInicio: '2026-06-01', moneda: pyg, estado: 'ACTIVO',
  });
  const cuotaCpcB: any = await save(CuentaPorCobrarCuota, { cuentaPorCobrar: cpcB, numero: 1, fechaVencimiento: '2026-06-15', monto: 60000, montoCobrado: 0, estado: 'PENDIENTE' });

  const liqF = await invokeHandlerWithContext('generar-liquidacion-final', undefined, { funcionarioId: funcB.id, fechaEgreso: '2026-07-31', motivoEgreso: 'RENUNCIA' });
  const detF = await invokeHandlerWithContext('get-liquidacion-final', undefined, liqF.id);
  ok(approx(detF.totalHaberes, 100000), 'haberes = aguinaldo proporcional 100.000', detF.totalHaberes);
  ok(approx(detF.totalDescuentos, 100000), 'descuentos neteados = 100.000 (topado a haberes)', detF.totalDescuentos);
  ok(approx(detF.totalNeto, 0), 'neto topado en 0', detF.totalNeto);
  const descF = (detF.items || []).filter((i: any) => i.tipo === 'DESCUENTO');
  const valeItem = descF.find((i: any) => i.referenciaTipo === 'VALE');
  const cppItem = descF.find((i: any) => i.referenciaTipo === 'CPP_CUOTA');
  const cpcItem = descF.find((i: any) => i.referenciaTipo === 'CPC_CUOTA');
  ok(valeItem && approx(valeItem.monto, 50000), 'prioridad 1: vale completo 50.000', valeItem?.monto);
  ok(cppItem && approx(cppItem.monto, 50000), 'prioridad 2: préstamo parcial 50.000 (queda 30.000)', cppItem?.monto);
  ok(!cpcItem, 'prioridad 3: crédito NO se netea (haberes agotados)', cpcItem?.monto);

  await invokeHandlerWithContext('aprobar-liquidacion-final', undefined, liqF.id);
  await invokeHandlerWithContext('pagar-liquidacion-final', undefined, liqF.id, { cajaMayorId: caja.id, monedaId: pyg.id, formaPagoId: formaPago.id });
  const valePos: any = await ds.getRepository(Vale).findOne({ where: { funcionario: { id: funcB.id } as any } });
  ok(valePos.estado === 'DESCONTADO', 'al pagar final, vale queda DESCONTADO', valePos.estado);
  const cuotaCppPos: any = await ds.getRepository(CuentaPorPagarCuota).findOne({ where: { id: cuotaCppB.id } });
  ok(cuotaCppPos.estado === 'PARCIAL' && approx(cuotaCppPos.montoPagado, 50000), 'cuota préstamo PARCIAL 50.000', { estado: cuotaCppPos.estado, pagado: cuotaCppPos.montoPagado });
  const cuotaCpcPos: any = await ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id: cuotaCpcB.id } });
  ok(cuotaCpcPos.estado === 'PENDIENTE' && approx(cuotaCpcPos.montoCobrado, 0), 'crédito NO tocado (residual queda a cobrar)', { estado: cuotaCpcPos.estado, cobrado: cuotaCpcPos.montoCobrado });

  // ===== TEST C: resumen financiero + vínculo cliente->funcionario =====
  console.log('\n[C] Resumen financiero y vínculo cruzado');
  const resumen = await invokeHandlerWithContext('get-funcionario-resumen-financiero', undefined, funcB.id);
  ok(!!resumen.cliente && resumen.cliente.id === cliB.id, 'resumen trae el cliente vinculado', resumen.cliente?.id);
  ok(approx(resumen.credito.saldo, 60000), 'resumen: consumo a crédito 60.000 (residual)', resumen.credito?.saldo);
  ok(approx(resumen.prestamos.saldo, 30000), 'resumen: saldo préstamo 30.000 (residual)', resumen.prestamos?.saldo);
  const vinc = await invokeHandlerWithContext('get-funcionario-de-cliente', undefined, cliB.id);
  ok(!!vinc && vinc.id === funcB.id, 'get-funcionario-de-cliente resuelve el funcionario', vinc?.id);

  await ds.destroy();
  console.log(`\n[funcionario-vales] Resultado: ${passed} OK, ${failed} FALLARON.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
