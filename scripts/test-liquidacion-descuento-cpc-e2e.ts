/**
 * E2E: liquidación de sueldo descuenta consumos a crédito (CPC) vencidos y cierra
 * lo descontado a mano (docs/planes/PLAN-liquidacion-descuento-cpc.md).
 *
 *  A) Paso 11: toma cuotas vencidas ANTES del período, de todas las fichas de
 *     cliente de la persona; no toma COBRADO/CANCELADO ni las de otra liquidación.
 *     Regenerar no duplica ni fuga. Tope: neto no queda negativo.
 *  B) Paso 6: cuota de préstamo vencida de un mes anterior entra; la que está en
 *     otro BORRADOR, no.
 *  C) agregar-item: rechaza CREDITO_CONSUMO libre; con cpcCuotaIds crea y enlaza;
 *     sobrevive a regenerar; eliminar libera; pagar cobra el ítem manual.
 *  D) cobrar-cpc-por-liquidacion: validaciones, parcial/total, tope por ítem,
 *     sin Caja Mayor, aviso de doble descuento, revertir y anular.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-liquidacion-descuento-cpc-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerLiquidacionSueldoHandlers, seedLiquidacionConceptos } from '../electron/handlers/liquidacion-sueldo.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
function approx(a: number, b: number): boolean { return Math.abs(Number(a) - Number(b)) < 0.01; }
async function rejects(p: Promise<any>, re: RegExp, name: string) {
  try { await p; ok(false, name, 'no rechazó'); } catch (e: any) { ok(re.test(String(e?.message || e)), name, e?.message); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-liquidacion-descuento-cpc.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[liquidacion-descuento-cpc] Migraciones OK.');

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
  const { LiquidacionSueldo } = E('rrhh/liquidacion-sueldo.entity');
  const { LiquidacionItem } = E('rrhh/liquidacion-item.entity');
  const { LiquidacionConcepto } = E('rrhh/liquidacion-concepto.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');
  const { CajaMayorMovimiento } = E('financiero/caja-mayor-movimiento.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');
  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const { CuentaPorPagar } = E('financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = E('financiero/cuenta-por-pagar-cuota.entity');

  const save = <T>(cls: any, data: any): Promise<T> => ds.getRepository(cls).save(ds.getRepository(cls).create(data));
  const get = (cls: any, id: number): Promise<any> => ds.getRepository(cls).findOne({ where: { id } });
  const call = (ch: string, ...args: any[]) => invokeHandlerWithContext(ch, undefined, ...args);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  await save(UsuarioRole, { usuario: admin, role });
  for (const codigo of ['RRHH_LIQUIDACION_GENERAR', 'RRHH_LIQUIDACION_APROBAR', 'RRHH_LIQUIDACION_PAGAR']) {
    const perm: any = await save(Permission, { codigo, descripcion: codigo, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await seedLiquidacionConceptos(ds);
  registerLiquidacionSueldoHandlers(ds, () => admin);
  const conceptoCredito: any = await ds.getRepository(LiquidacionConcepto).findOne({ where: { codigo: 'CREDITO_CONSUMO' } });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const tipoCli: any = await save(TipoCliente, { descripcion: 'CONVENIADO', activo: true, credito: true });
  const cargo: any = await save(Cargo, { nombre: 'COCINA', activo: true });
  const caja: any = await save(CajaMayor, { nombre: 'CAJA CENTRAL', estado: 'ABIERTA', fechaApertura: new Date(), activo: true });
  const formaPago: any = await save(FormasPago, { nombre: 'EFECTIVO', movimentaCaja: true, activo: true });
  const pagoCaja = { fuente: 'CAJA_MAYOR', cajaMayorId: caja.id, monedaId: pyg.id, formaPagoId: formaPago.id };

  const nuevoFunc = async (nombre: string, salario: number) => {
    const persona: any = await save(Persona, { nombre, apellido: 'TEST', activo: true });
    const func: any = await save(Funcionario, { persona, cargo, fechaIngreso: '2026-01-01', salarioBase: salario, monedaSalario: pyg, activo: true, ipsActivo: false, esJornalero: false });
    return { persona, func };
  };
  const nuevoCliente = (persona: any, saldo: number) => save(Cliente, { persona, tipo_cliente: tipoCli, credito: true, limite_credito: 9000000, saldoActual: saldo });
  const consumo = async (cli: any, fecha: string, monto: number, estado = 'PENDIENTE', cobrado = 0) => {
    const cpc: any = await save(CuentaPorCobrar, { cliente: cli, tipo: 'CREDITO_VENTA', descripcion: `VENTA ${fecha}`, montoTotal: monto, montoCobrado: cobrado, cantidadCuotas: 1, fechaInicio: fecha, moneda: pyg, estado: estado === 'CANCELADO' ? 'CANCELADO' : 'ACTIVO' });
    return save(CuentaPorCobrarCuota, { cuentaPorCobrar: cpc, numero: 1, fechaVencimiento: fecha, monto, montoCobrado: cobrado, estado });
  };
  const items = async (liqId: number) => (await call('get-liquidacion-sueldo', liqId)).items as any[];
  const cpcItems = async (liqId: number) => (await items(liqId)).filter((i) => i.referenciaTipo === 'CPC_CUOTA');

  // ===== A =====
  console.log('\n[A] Paso 11: consumos vencidos antes del período, todas las fichas');
  const A = await nuevoFunc('ANA', 3000000);
  const cliA1: any = await nuevoCliente(A.persona, 0);
  const cliA2: any = await nuevoCliente(A.persona, 0);
  const qSep: any = await consumo(cliA1, '2026-09-20', 100000);
  const qOct: any = await consumo(cliA2, '2026-10-05', 50000);     // otra ficha
  const qNov: any = await consumo(cliA1, '2026-11-10', 30000);     // dentro del período
  const qDic: any = await consumo(cliA1, '2026-12-02', 999000);    // después del período: no
  await consumo(cliA1, '2026-10-01', 70000, 'COBRADO', 70000);    // cobrada: no
  await consumo(cliA1, '2026-10-02', 80000, 'CANCELADO');          // cancelada: no
  // Reservada por OTRA liquidación (borrador de otro período)
  const otraLiq: any = await save(LiquidacionSueldo, { funcionario: A.func, periodo: '2026-10', fechaInicio: '2026-10-01', fechaFin: '2026-10-31', salarioBase: 3000000, totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, monedaPago: pyg, estado: 'BORRADOR' });
  const qReservada: any = await consumo(cliA1, '2026-10-15', 40000);
  await ds.getRepository(CuentaPorCobrarCuota).update(qReservada.id, { liquidacionId: otraLiq.id });

  const liqA = await call('generar-liquidacion-borrador', { funcionarioId: A.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  let ci = await cpcItems(liqA.id);
  const refs = ci.map((i) => i.referenciaId).sort((a, b) => a - b);
  ok(JSON.stringify(refs) === JSON.stringify([qSep.id, qOct.id, qNov.id].sort((a, b) => a - b)), 'toma sep (vencida antes), oct (otra ficha) y nov; no dic/cobrada/cancelada/reservada', refs);
  ok(ci.every((i) => i.concepto?.codigo === 'CREDITO_CONSUMO'), 'concepto CREDITO_CONSUMO');
  ok((await get(CuentaPorCobrarCuota, qSep.id)).liquidacionId === liqA.id, 'cuota enlazada al borrador');
  ok((await get(CuentaPorCobrarCuota, qReservada.id)).liquidacionId === otraLiq.id, 'la reservada sigue en la otra liquidación');
  const det1 = await call('get-liquidacion-sueldo', liqA.id);
  ok(approx(det1.totalNeto, 3000000 - 180000), 'neto = 3.000.000 - 180.000', det1.totalNeto);

  await call('generar-liquidacion-borrador', { funcionarioId: A.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  ci = await cpcItems(liqA.id);
  ok(ci.length === 3, 'regenerar no duplica', ci.length);

  // Tope: funcionario con neto chico
  const T = await nuevoFunc('TOPE', 100000);
  const cliT: any = await nuevoCliente(T.persona, 0);
  const qT1: any = await consumo(cliT, '2026-10-01', 60000);
  const qT2: any = await consumo(cliT, '2026-10-02', 60000);
  const qT3: any = await consumo(cliT, '2026-10-03', 60000);
  const liqT = await call('generar-liquidacion-borrador', { funcionarioId: T.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  const detT = await call('get-liquidacion-sueldo', liqT.id);
  ok(approx(detT.totalNeto, 0), 'tope: neto queda en 0, no negativo', detT.totalNeto);
  const itT = detT.items.filter((i: any) => i.referenciaTipo === 'CPC_CUOTA');
  ok(itT.length === 2 && approx(itT[1].monto, 40000), 'tope: 2.ª cuota por lo que alcanza (40.000), 3.ª queda afuera', itT.map((i: any) => i.monto));
  ok((liqT.advertencias || []).some((a: string) => /no entraron/.test(a)), 'tope: advierte lo que no entró', liqT.advertencias);
  ok(!(await get(CuentaPorCobrarCuota, qT3.id)).liquidacionId, 'la 3.ª no queda enlazada');
  await call('aprobar-liquidacion-sueldo', liqT.id);
  await call('pagar-liquidacion-sueldo', liqT.id, pagoCaja);
  const qT2pos = await get(CuentaPorCobrarCuota, qT2.id);
  ok(qT2pos.estado === 'PARCIAL' && approx(qT2pos.montoCobrado, 40000) && !qT2pos.liquidacionId, 'pago: la parcial queda PARCIAL y libre para la próxima', qT2pos);
  ok((await get(CuentaPorCobrarCuota, qT1.id)).estado === 'COBRADO', 'pago: la 1.ª COBRADO');
  const movT = await ds.getRepository(MovimientoCliente).find({ where: { cuentaPorCobrarCuotaId: qT1.id } });
  ok(movT.length === 1 && !!movT[0].liquidacionItemId, 'pago: movimiento con liquidacionItemId', movT);
  await call('anular-liquidacion-sueldo', liqT.id, 'test');
  const qT2an = await get(CuentaPorCobrarCuota, qT2.id);
  ok(qT2an.estado === 'PENDIENTE' && approx(qT2an.montoCobrado, 0), 'anular revierte también la parcial', qT2an);
  ok((await get(CuentaPorCobrarCuota, qT1.id)).estado === 'PENDIENTE', 'anular revierte la total');
  ok(approx((await get(Cliente, cliT.id)).saldoActual, 0), 'anular: saldo cliente restituido (0 → -100.000 → 0)', (await get(Cliente, cliT.id)).saldoActual);

  // ===== B =====
  console.log('\n[B] Paso 6: cuota de préstamo vencida de un mes anterior');
  const cpp: any = await save(CuentaPorPagar, { descripcion: 'PRESTAMO', tipo: 'PRESTAMO_FUNCIONARIO', funcionario: A.func, montoTotal: 300000, montoPagado: 0, moneda: pyg, fechaInicio: '2026-08-01', cantidadCuotas: 3, estado: 'ACTIVO' });
  const cAgo: any = await save(CuentaPorPagarCuota, { cuentaPorPagar: cpp, numero: 1, fechaVencimiento: '2026-08-30', monto: 100000, montoPagado: 0, estado: 'PENDIENTE' });
  const cOct: any = await save(CuentaPorPagarCuota, { cuentaPorPagar: cpp, numero: 2, fechaVencimiento: '2026-10-30', monto: 100000, montoPagado: 0, estado: 'PENDIENTE' });
  const cDic: any = await save(CuentaPorPagarCuota, { cuentaPorPagar: cpp, numero: 3, fechaVencimiento: '2026-12-30', monto: 100000, montoPagado: 0, estado: 'PENDIENTE' });
  await save(LiquidacionItem, { liquidacion: otraLiq, descripcion: 'cuota oct', monto: 100000, tipo: 'DESCUENTO', referenciaId: cOct.id, referenciaTipo: 'CPP_CUOTA', manual: false });
  await call('generar-liquidacion-borrador', { funcionarioId: A.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  const cppRefs = (await items(liqA.id)).filter((i) => i.referenciaTipo === 'CPP_CUOTA').map((i) => i.referenciaId);
  ok(cppRefs.includes(cAgo.id), 'toma la cuota vencida de agosto', cppRefs);
  ok(!cppRefs.includes(cOct.id), 'no toma la que está en otro BORRADOR', cppRefs);
  ok(!cppRefs.includes(cDic.id), 'no toma la que vence después del período', cppRefs);

  // ===== C =====
  console.log('\n[C] agregar-item con cuotas elegidas');
  await rejects(call('agregar-item-liquidacion', liqA.id, { conceptoId: conceptoCredito.id, descripcion: 'convenio', monto: 10000, tipo: 'DESCUENTO' }), /eligiendo las cuotas/, 'rechaza CREDITO_CONSUMO a mano');
  const qDicTomado = await call('agregar-item-liquidacion', liqA.id, { cpcCuotaIds: [qDic.id] });
  ok(Array.isArray(qDicTomado) && qDicTomado.length === 1 && qDicTomado[0].manual && qDicTomado[0].referenciaId === qDic.id, 'con cpcCuotaIds crea ítem manual CPC_CUOTA', qDicTomado);
  ok((await get(CuentaPorCobrarCuota, qDic.id)).liquidacionId === liqA.id, 'enlaza la cuota elegida');
  await rejects(call('agregar-item-liquidacion', liqA.id, { cpcCuotaIds: [qDic.id] }), /ya está/, 'no la agrega dos veces');
  await rejects(call('agregar-item-liquidacion', liqA.id, { cpcCuotaIds: [qReservada.id] }), /liquidación #/, 'rechaza la cuota de otra liquidación');
  await rejects(call('agregar-item-liquidacion', liqA.id, { cpcCuotaIds: [qT1.id] }), /no es de este funcionario/, 'rechaza cuota de otra persona');
  await call('generar-liquidacion-borrador', { funcionarioId: A.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  ci = await cpcItems(liqA.id);
  ok(ci.length === 4 && ci.filter((i) => i.referenciaId === qDic.id).length === 1, 'regenerar conserva el manual sin duplicarlo', ci.map((i) => i.referenciaId));
  ok((await get(CuentaPorCobrarCuota, qDic.id)).liquidacionId === liqA.id, 'regenerar re-enlaza la cuota manual');
  const cuotasAbiertas = await call('get-cpc-cuotas-abiertas-funcionario', A.func.id, liqA.id);
  ok(cuotasAbiertas.some((c: any) => c.cuotaId === qDic.id) && !cuotasAbiertas.some((c: any) => c.cuotaId === qReservada.id), 'lectura de cuotas abiertas (libres o de esta liquidación)', cuotasAbiertas.map((c: any) => c.cuotaId));
  const itDic = ci.find((i) => i.referenciaId === qDic.id);
  await call('eliminar-item-liquidacion', itDic.id);
  ok(!(await get(CuentaPorCobrarCuota, qDic.id)).liquidacionId, 'eliminar libera la cuota');
  await call('agregar-item-liquidacion', liqA.id, { cpcCuotaIds: [qDic.id] });
  await call('aprobar-liquidacion-sueldo', liqA.id);
  await call('pagar-liquidacion-sueldo', liqA.id, pagoCaja);
  ok((await get(CuentaPorCobrarCuota, qDic.id)).estado === 'COBRADO', 'pagar cobra el ítem manual CPC_CUOTA');
  ok((await get(CuentaPorCobrarCuota, qSep.id)).estado === 'COBRADO' && (await get(CuentaPorCobrarCuota, qOct.id)).estado === 'COBRADO', 'pagar cobra los automáticos (2 fichas)');
  const liqApag = await get(LiquidacionSueldo, liqA.id);
  const movCaja = await get(CajaMayorMovimiento, liqApag.movimientoId);
  ok(approx(movCaja.monto, liqApag.totalNeto), 'Caja Mayor: un EGRESO por el neto', { mov: movCaja.monto, neto: liqApag.totalNeto });

  // ===== D =====
  console.log('\n[D] cobrar-cpc-por-liquidacion (cierre de lo descontado a mano)');
  const F = await nuevoFunc('FERMINA', 3044500);
  const cliF: any = await nuevoCliente(F.persona, 0);
  const f1: any = await consumo(cliF, '2026-09-10', 400000);
  const f2: any = await consumo(cliF, '2026-09-20', 500000);
  const f3: any = await consumo(cliF, '2026-10-05', 200000);
  await ds.getRepository(Cliente).update(cliF.id, { saldoActual: 1100000 });
  // Liquidación de oct pagada a mano (convenio 981.000), como en Don Franco
  const liqF: any = await save(LiquidacionSueldo, { funcionario: F.func, periodo: '2026-10', fechaInicio: '2026-10-01', fechaFin: '2026-10-31', salarioBase: 3044500, totalHaberes: 3044500, totalDescuentos: 981000, totalNeto: 2063500, monedaPago: pyg, estado: 'PAGADA', fechaPago: new Date('2026-10-07T12:00:00Z') });
  const itConv: any = await save(LiquidacionItem, { liquidacion: liqF, concepto: conceptoCredito, descripcion: 'convenio', monto: 981000, tipo: 'DESCUENTO', manual: true });
  const itAuto: any = await save(LiquidacionItem, { liquidacion: liqF, descripcion: 'Salario', monto: 3044500, tipo: 'HABER', manual: false });
  const borradorF: any = await save(LiquidacionSueldo, { funcionario: F.func, periodo: '2026-09', fechaInicio: '2026-09-01', fechaFin: '2026-09-30', salarioBase: 1, totalHaberes: 0, totalDescuentos: 0, totalNeto: 0, monedaPago: pyg, estado: 'BORRADOR' });

  // Aviso de doble descuento al generar el borrador de noviembre
  const liqFnov = await call('generar-liquidacion-borrador', { funcionarioId: F.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  ok((liqFnov.advertencias || []).some((a: string) => a.includes(`#${liqF.id}`)), 'avisa del posible doble descuento', liqFnov.advertencias);
  // Liberar: el borrador de nov se elimina del juego (RRHH lo regenera después de cerrar)
  for (const it of await cpcItems(liqFnov.id)) await call('eliminar-item-liquidacion', it.id);

  const cajaAntes = await ds.getRepository(CajaMayorMovimiento).count();
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: borradorF.id, itemId: itConv.id, cuotas: [{ cuotaId: f1.id }] }), /PAGADA/, 'rechaza si la liquidación no está PAGADA');
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itAuto.id, cuotas: [{ cuotaId: f1.id }] }), /cargado a mano/, 'rechaza un ítem que no es descuento manual');
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itConv.id, cuotas: [{ cuotaId: qT1.id }] }), /no es de este funcionario/, 'rechaza cuota de otra persona');
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itConv.id, cuotas: [{ cuotaId: f1.id }, { cuotaId: f2.id }, { cuotaId: f3.id }] }), /Se pasa del descuento/, 'tope: 1.100.000 > 981.000');
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itConv.id, cuotas: [{ cuotaId: f1.id, monto: 500000 }] }), /tiene saldo/, 'rechaza monto mayor al saldo de la cuota');

  const r1 = await call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itConv.id, cuotas: [{ cuotaId: f1.id }, { cuotaId: f2.id }, { cuotaId: f3.id, monto: 81000 }] });
  ok(approx(r1.cobrado, 981000) && approx(r1.disponibleItem, 0), 'cobra 981.000 y deja el ítem sin disponible', r1);
  const f1p = await get(CuentaPorCobrarCuota, f1.id);
  ok(f1p.estado === 'COBRADO' && f1p.liquidacionId === liqF.id, 'total: COBRADO enlazada a la liquidación', f1p);
  const f3p = await get(CuentaPorCobrarCuota, f3.id);
  ok(f3p.estado === 'PARCIAL' && approx(f3p.montoCobrado, 81000) && !f3p.liquidacionId, 'parcial: PARCIAL sin enlace (el resto va a la próxima)', f3p);
  ok(approx((await get(Cliente, cliF.id)).saldoActual, 119000), 'saldo del cliente baja a 119.000', (await get(Cliente, cliF.id)).saldoActual);
  ok((await ds.getRepository(CajaMayorMovimiento).count()) === cajaAntes, 'no crea movimiento de Caja Mayor');
  await rejects(call('cobrar-cpc-por-liquidacion', { liquidacionId: liqF.id, itemId: itConv.id, cuotas: [{ cuotaId: f3.id, monto: 1 }] }), /Se pasa del descuento/, 'tope acumulado por ítem');

  const liqFnov2 = await call('generar-liquidacion-borrador', { funcionarioId: F.func.id, periodo: '2026-11', monedaPagoId: pyg.id });
  const ciNov = await cpcItems(liqFnov2.id);
  ok(ciNov.length === 1 && ciNov[0].referenciaId === f3.id && approx(ciNov[0].monto, 119000), 'nov toma solo el resto de la parcial (119.000)', ciNov.map((i) => [i.referenciaId, i.monto]));
  ok(!(liqFnov2.advertencias || []).some((a: string) => a.includes(`#${liqF.id}`)), 'ya cerrado: no avisa doble descuento', liqFnov2.advertencias);
  for (const it of ciNov) await call('eliminar-item-liquidacion', it.id);

  const movF1 = (await ds.getRepository(MovimientoCliente).find({ where: { cuentaPorCobrarCuotaId: f1.id } }))[0];
  ok(movF1 && movF1.liquidacionItemId === itConv.id && !movF1.cajaMayorMovimientoId, 'movimiento enlazado al ítem, sin caja', movF1);
  const rv = await call('revertir-cobro-cpc-por-liquidacion', { movimientoClienteId: movF1.id });
  ok(approx(rv.revertido, 400000), 'revertir devuelve 400.000', rv);
  const f1r = await get(CuentaPorCobrarCuota, f1.id);
  ok(f1r.estado === 'PENDIENTE' && !f1r.liquidacionId, 'revertir reabre la cuota y la libera', f1r);
  ok(approx((await get(Cliente, cliF.id)).saldoActual, 519000), 'revertir restituye saldo', (await get(Cliente, cliF.id)).saldoActual);
  const movAuto = (await ds.getRepository(MovimientoCliente).find({ where: { cuentaPorCobrarCuotaId: qSep.id } }))[0];
  await rejects(call('revertir-cobro-cpc-por-liquidacion', { movimientoClienteId: movAuto.id }), /anulando la liquidación/, 'no revierte un cobro automático (eso es anular)');

  // Anular la liquidación pagada revierte también los cierres contra su descuento manual
  await call('anular-liquidacion-sueldo', liqF.id, 'test');
  ok((await get(CuentaPorCobrarCuota, f2.id)).estado === 'PENDIENTE' && (await get(CuentaPorCobrarCuota, f3.id)).estado === 'PENDIENTE', 'anular revierte los cierres del método nuevo');
  ok(approx((await get(Cliente, cliF.id)).saldoActual, 1100000), 'anular: saldo vuelve a 1.100.000', (await get(Cliente, cliF.id)).saldoActual);
  ok((await ds.getRepository(MovimientoCliente).count({ where: { liquidacionItemId: itConv.id } })) === 0, 'anular borra los movimientos enlazados');

  await ds.destroy();
  console.log(`\n[liquidacion-descuento-cpc] Resultado: ${passed} OK, ${failed} FALLARON.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('ERROR FATAL:', e); process.exit(1); });
