/**
 * E2E del pago consolidado de obligaciones (Caja Mayor), sobre SQLite real con
 * migraciones y los handlers de verdad.
 *
 * Cubre lo que el util puro no puede: que la plata que sale de la caja sea
 * exactamente la que entra en las deudas, que un evento se pueda deshacer entero
 * y que nadie pueda revertir la misma plata dos veces por otro camino.
 *
 * Uso: npm run test:pago-consolidado-e2e
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { registerPagoConsolidadoHandlers } from '../electron/handlers/pago-consolidado.handler';
import { registerValesHandlers } from '../electron/handlers/vales.handler';
import { getCotizacionBidireccional } from '../electron/utils/moneda.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pago-consolidado.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[pago-consolidado] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');
  const { CajaMayorSaldo } = E('financiero/caja-mayor-saldo.entity');
  const { CuentaBancaria } = E('financiero/cuenta-bancaria.entity');
  const { Gasto } = E('financiero/gasto.entity');
  const { GastoCategoria } = E('financiero/gasto-categoria.entity');
  const { Proveedor } = E('compras/proveedor.entity');
  const { CuentaPorPagar } = E('financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = E('financiero/cuenta-por-pagar-cuota.entity');
  const { Persona } = E('personas/persona.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Vale } = E('rrhh/vale.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // ── Seed ──
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['CAJA_MAYOR_OPERAR', 'COMPRAS_GESTIONAR', 'RRHH_VALE_CONFIRMAR', 'RRHH_VALE_CREAR', 'RRHH_LIQUIDACION_PAGAR']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'USD', principal: false, decimales: 2, activo: true });
  // Sólo se carga la fila extranjera -> PYG, que es lo que hace el diálogo real.
  await save(MonedaCambio, { monedaOrigen: usd, monedaDestino: pyg, compraOficial: 7400, ventaOficial: 7600, compraLocal: 7500, ventaLocal: 7600, activo: true });

  const efectivo: any = await save(FormasPago, { nombre: 'EFECTIVO', movimentaCaja: true, principal: true, orden: 1, activo: true });
  const caja: any = await save(CajaMayor, { nombre: 'CM CENTRO', estado: 'ABIERTA', fechaApertura: new Date(), responsable: admin, activo: true });
  await save(CajaMayorSaldo, { cajaMayor: caja, moneda: pyg, formaPago: efectivo, saldo: 5_000_000 });
  await save(CajaMayorSaldo, { cajaMayor: caja, moneda: usd, formaPago: efectivo, saldo: 1000 });
  const banco: any = await save(CuentaBancaria, { nombre: 'CUENTA CORRIENTE', banco: 'ITAU', numeroCuenta: '123456', titular: 'FRC', saldo: 2_000_000, moneda: pyg, activo: true });
  const catGasto: any = await save(GastoCategoria, { nombre: 'SERVICIOS', activo: true });

  registerCajaMayorHandlers(ds, () => admin);
  registerPagoConsolidadoHandlers(ds, () => admin);
  registerValesHandlers(ds, () => admin);

  const gasto = (monto: number, desc: string, moneda: any = pyg) =>
    save(Gasto, { gastoCategoria: catGasto, descripcion: desc, monto, moneda, fecha: new Date(), cajaMayor: caja, estado: 'PENDIENTE' });
  const saldoDe = async (moneda: any) => {
    const s: any = await ds.getRepository(CajaMayorSaldo).findOne({
      where: { cajaMayor: { id: caja.id }, moneda: { id: moneda.id }, formaPago: { id: efectivo.id } } as any,
    });
    return Number(s?.saldo ?? 0);
  };

  // ═══════════ [A] Gastos: multi-línea y multi-moneda ═══════════
  console.log('\n[A] Pago de 2 gastos con 2 líneas (Gs + USD)');
  {
    const g1: any = await gasto(300_000, 'INTERNET');
    const g2: any = await gasto(450_000, 'ENERGIA');
    const saldoPygIni = await saldoDe(pyg);
    const saldoUsdIni = await saldoDe(usd);

    // 750.000 Gs = 300.000 en efectivo Gs + 60 USD a 7.500
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO',
      items: [{ origenId: g1.id, monto: 300_000 }, { origenId: g2.id, monto: 450_000 }],
      lineas: [
        { fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 300_000 },
        { fuente: 'CAJA_MAYOR', monedaId: usd.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 60, cotizacion: 7500 },
      ],
    });
    ok(res?.montoTotal === 750_000, 'A: el evento cubre 750.000', res?.montoTotal);

    const movs: any[] = await ds.query(`SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id} ORDER BY id`);
    ok(movs.length === 2, 'A: 2 movimientos (uno por moneda), no uno por gasto', movs.length);
    ok(movs.every((m) => m.tipo_movimiento === 'EGRESO_GASTO'), 'A: ambos conservan EGRESO_GASTO');

    ok(await saldoDe(pyg) === saldoPygIni - 300_000, 'A: saldo Gs descontado');
    ok(await saldoDe(usd) === saldoUsdIni - 60, 'A: saldo USD descontado en SU moneda, sin convertir');

    const dets: any[] = await ds.query(`SELECT * FROM pagos_consolidados_detalles WHERE pago_consolidado_id = ${res.id}`);
    // El reparto cae justo: 300.000 = línea Gs, 450.000 = línea USD convertida.
    ok(dets.length === 2, 'A: 2 filas de detalle, una por (obligación x línea)', dets.length);
    const imputado = dets.reduce((s, d) => s + Number(d.monto_imputado), 0);
    ok(Math.round(imputado) === 750_000, 'A: lo imputado suma exactamente la deuda', imputado);

    const gastos: any[] = await ds.getRepository(Gasto).findByIds([g1.id, g2.id]);
    ok(gastos.every((g) => g.estado === 'PAGADO'), 'A: los 2 gastos quedaron PAGADO');

    const det: any = await invokeHandler('get-pago-consolidado-detalle', res.id);
    ok(det.items.length === 2, 'A: el detalle agrupa por obligación');
    ok(det.lineas.length === 2, 'A: el detalle agrupa por línea física');

    // Reversa completa
    await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
    ok(await saldoDe(pyg) === saldoPygIni, 'A: saldo Gs restituido exacto');
    ok(await saldoDe(usd) === saldoUsdIni, 'A: saldo USD restituido exacto');
    const gastos2: any[] = await ds.getRepository(Gasto).findByIds([g1.id, g2.id]);
    ok(gastos2.every((g) => g.estado === 'PENDIENTE'), 'A: los gastos volvieron a PENDIENTE');
  }

  console.log('\n[A2] Una línea que se parte entre dos obligaciones');
  {
    const g1: any = await gasto(70_000, 'PARTIDO 1');
    const g2: any = await gasto(30_000, 'PARTIDO 2');
    const saldoIni = await saldoDe(pyg);
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO',
      items: [{ origenId: g1.id, monto: 70_000 }, { origenId: g2.id, monto: 30_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 100_000 }],
    });
    const movs: any[] = await ds.query(`SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id}`);
    ok(movs.length === 1, 'A2: un solo billete = un solo movimiento', movs.length);
    const dets: any[] = await ds.query(`SELECT * FROM pagos_consolidados_detalles WHERE pago_consolidado_id = ${res.id} ORDER BY id`);
    ok(dets.length === 2, 'A2: la línea se parte en 2 filas', dets.length);
    const suma = dets.reduce((s, d) => s + Number(d.monto_origen), 0);
    ok(suma === 100_000, 'A2: lo que sale por la línea suma exactamente su monto', suma);
    ok(await saldoDe(pyg) === saldoIni - 100_000, 'A2: la caja se descontó una sola vez');
    await invokeHandler('anular-pago-consolidado', res.id, 'limpieza');
  }

  // ═══════════ [B] Cuota de compra: pago parcial ═══════════
  console.log('\n[B] Cuota de compra con pago parcial');
  {
    const prov: any = await save(Proveedor, { nombre: 'DISTRIBUIDORA CAMPOS', activo: true });
    const cpp: any = await save(CuentaPorPagar, {
      descripcion: 'COMPRA #1', tipo: 'COMPRA', proveedor: prov, montoTotal: 1_000_000,
      montoPagado: 0, moneda: pyg, fechaInicio: new Date(), cantidadCuotas: 1, estado: 'ACTIVO',
    });
    const cuota: any = await save(CuentaPorPagarCuota, {
      numero: 1, fechaVencimiento: new Date(), monto: 1_000_000, montoPagado: 0,
      estado: 'PENDIENTE', cuentaPorPagar: cpp,
    });

    const pend: any[] = await invokeHandler('get-obligaciones-pendientes', 'COMPRA');
    ok(pend.length === 1 && pend[0].origenId === cuota.id, 'B: la cuota aparece como pendiente');
    ok(pend[0].beneficiario === 'DISTRIBUIDORA CAMPOS', 'B: trae el proveedor');

    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COMPRA',
      items: [{ origenId: cuota.id, monto: 400_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 400_000 }],
    });
    const c1: any = await ds.getRepository(CuentaPorPagarCuota).findOne({ where: { id: cuota.id } });
    ok(c1.estado === 'PARCIAL', 'B: la cuota queda PARCIAL', c1.estado);
    ok(Number(c1.montoPagado) === 400_000, 'B: montoPagado correcto', c1.montoPagado);

    // Un gasto NO admite parcial; una cuota de compra sí.
    let errParcial = '';
    const gp: any = await gasto(100_000, 'PARCIAL NO');
    try {
      await invokeHandler('registrar-pago-consolidado', {
        concepto: 'GASTO',
        items: [{ origenId: gp.id, monto: 50_000 }],
        lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 50_000 }],
      });
    } catch (e: any) { errParcial = e.message; }
    ok(/entera o no se paga/.test(errParcial), 'B: un gasto no se paga parcial', errParcial);

    await invokeHandler('anular-pago-consolidado', res.id, 'revertir parcial');
    const c2: any = await ds.getRepository(CuentaPorPagarCuota).findOne({ where: { id: cuota.id } });
    ok(Number(c2.montoPagado) === 0 && c2.estado === 'PENDIENTE', 'B: la anulación reabre la cuota', c2.estado);
  }

  // ═══════════ [C] Vale pagado desde cuenta bancaria ═══════════
  console.log('\n[C] Vale pagado por banco');
  {
    const persona: any = await save(Persona, { nombre: 'GABRIEL', apellido: 'FRANCO', activo: true });
    const func: any = await save(Funcionario, { persona, fechaIngreso: new Date(), salarioBase: 2_800_000, activo: true });
    const vale: any = await save(Vale, {
      funcionario: func, monto: 250_000, fecha: new Date(), moneda: pyg,
      estado: 'SOLICITADO', esAdelanto: true,
    });
    const saldoBancoIni = Number((await ds.getRepository(CuentaBancaria).findOne({ where: { id: banco.id } }))!.saldo);

    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'VALE',
      items: [{ origenId: vale.id, monto: 250_000 }],
      lineas: [{ fuente: 'CUENTA_BANCARIA', monedaId: pyg.id, cuentaBancariaId: banco.id, monto: 250_000 }],
    });
    const v1: any = await ds.getRepository(Vale).findOne({ where: { id: vale.id } });
    ok(v1.estado === 'CONFIRMADO', 'C: el vale queda CONFIRMADO', v1.estado);
    const saldoBanco1 = Number((await ds.getRepository(CuentaBancaria).findOne({ where: { id: banco.id } }))!.saldo);
    ok(saldoBanco1 === saldoBancoIni - 250_000, 'C: la cuenta bancaria se debitó', saldoBanco1);

    const movsCaja: any[] = await ds.query(`SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id}`);
    ok(movsCaja.length === 0, 'C: un pago por banco NO toca Caja Mayor', movsCaja.length);

    const dets: any[] = await ds.query(`SELECT * FROM pagos_consolidados_detalles WHERE pago_consolidado_id = ${res.id}`);
    ok(dets[0].movimiento_bancario_id != null, 'C: el detalle guarda el movimiento bancario');

    // El vale pagado por el evento no se puede anular por su cuenta: quedaría
    // ANULADO sin devolver la plata (vale.movimientoId está en null).
    let errVale = '';
    try { await invokeHandler('anular-vale', vale.id, 'x'); } catch (e: any) { errVale = e.message; }
    ok(/pago consolidado/i.test(errVale), 'C: anular-vale queda bloqueado', errVale);

    await invokeHandler('anular-pago-consolidado', res.id, 'revertir vale');
    const v2: any = await ds.getRepository(Vale).findOne({ where: { id: vale.id } });
    ok(v2.estado === 'SOLICITADO', 'C: el vale vuelve a SOLICITADO, no a ANULADO', v2.estado);
    const saldoBanco2 = Number((await ds.getRepository(CuentaBancaria).findOne({ where: { id: banco.id } }))!.saldo);
    ok(saldoBanco2 === saldoBancoIni, 'C: saldo bancario restituido', saldoBanco2);
  }

  // ═══════════ [D] Validaciones de mezcla ═══════════
  console.log('\n[D] Lo que no se puede mezclar');
  {
    const gPyg: any = await gasto(100_000, 'EN GS');
    const gUsd: any = await gasto(20, 'EN USD', usd);
    let err = '';
    try {
      await invokeHandler('registrar-pago-consolidado', {
        concepto: 'GASTO',
        items: [{ origenId: gPyg.id, monto: 100_000 }, { origenId: gUsd.id, monto: 20 }],
        lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 250_000 }],
      });
    } catch (e: any) { err = e.message; }
    ok(/misma moneda/.test(err), 'D: rechaza obligaciones de monedas distintas', err);

    let err2 = '';
    try {
      await invokeHandler('registrar-pago-consolidado', {
        concepto: 'GASTO',
        items: [{ origenId: gPyg.id, monto: 100_000 }],
        lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 90_000 }],
      });
    } catch (e: any) { err2 = e.message; }
    ok(/suman/.test(err2), 'D: rechaza formas de pago que no cubren la deuda', err2);

    // El saldo se relee del lado del servidor: mentir el monto no sirve.
    let err3 = '';
    try {
      await invokeHandler('registrar-pago-consolidado', {
        concepto: 'GASTO',
        items: [{ origenId: gPyg.id, monto: 999_999 }],
        lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 999_999 }],
      });
    } catch (e: any) { err3 = e.message; }
    ok(/supera el saldo|entera o no se paga/.test(err3), 'D: el saldo se valida contra la BD, no contra el cliente', err3);
  }

  // ═══════════ [E] Cotización en el sentido inverso ═══════════
  console.log('\n[E] Cotización invertida');
  {
    const directa = await getCotizacionBidireccional(ds, usd.id, pyg.id);
    ok(directa?.tasa === 7500 && directa?.invertida === false, 'E: USD -> Gs usa la fila cargada', directa);
    const inversa = await getCotizacionBidireccional(ds, pyg.id, usd.id);
    ok(!!inversa?.invertida && Math.abs((inversa!.tasa) - 1 / 7500) < 1e-9,
      'E: Gs -> USD invierte la tasa en vez de fallar', inversa);

    // Deuda en USD pagada con guaraníes: antes esto era un error duro.
    const gUsd: any = await gasto(20, 'SERVICIO EN USD', usd);
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO',
      items: [{ origenId: gUsd.id, monto: 20 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 150_000 }],
    });
    ok(!!res?.id, 'E: se puede pagar una deuda en USD con guaraníes', res);
    const gFinal: any = await ds.getRepository(Gasto).findOne({ where: { id: gUsd.id } });
    ok(gFinal.estado === 'PAGADO', 'E: el gasto en USD quedó pagado');
  }

  // ═══════════ [F] Doble anulación ═══════════
  console.log('\n[F] Idempotencia de la anulación');
  {
    const g: any = await gasto(80_000, 'DOBLE ANULACION');
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO',
      items: [{ origenId: g.id, monto: 80_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 80_000 }],
    });
    const saldoTrasPago = await saldoDe(pyg);
    await invokeHandler('anular-pago-consolidado', res.id, 'primera');
    const saldoTrasAnular = await saldoDe(pyg);
    let err = '';
    try { await invokeHandler('anular-pago-consolidado', res.id, 'segunda'); } catch (e: any) { err = e.message; }
    ok(/ya fue anulado/.test(err), 'F: no se puede anular dos veces', err);
    ok(await saldoDe(pyg) === saldoTrasAnular, 'F: el saldo no se movió con el segundo intento');
    ok(saldoTrasAnular === saldoTrasPago + 80_000, 'F: la reversa devolvió exactamente lo pagado');
  }

  // ═══════════ [G] Evento de un solo item ═══════════
  console.log('\n[G] Evento de una sola obligación');
  {
    const g: any = await gasto(120_000, 'UNICO');
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO',
      items: [{ origenId: g.id, monto: 120_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 120_000 }],
    });
    const mov: any[] = await ds.query(`SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id}`);
    ok(mov.length === 1 && Number(mov[0].gasto_id) === g.id,
      'G: con 1 item también setea la referencia clásica (filtros por proveedor)', mov[0]?.gasto_id);

    // Aun con gasto_id seteado, el chequeo del evento va primero.
    let err = '';
    try { await invokeHandler('anular-caja-mayor-movimiento', mov[0].id, 'x'); } catch (e: any) { err = e.message; }
    ok(/pago consolidado/i.test(err), 'G: el bloqueo del evento gana sobre la rama del gasto', err);
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} pago-consolidado-e2e: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
