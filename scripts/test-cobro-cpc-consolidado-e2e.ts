/**
 * E2E del cobro consolidado de cuentas por cobrar, sobre SQLite real con
 * migraciones y los handlers de verdad.
 *
 * Es el unico concepto del motor consolidado que va en sentido INGRESO, asi que
 * lo que se protege aca es sobre todo la direccion: que la caja SUBA al cobrar y
 * BAJE al anular, que el banco se acredite en vez de debitarse, y que la deuda
 * del cliente se mueva para el lado correcto en las dos puntas.
 *
 * Ademas cubre lo propio del cobro: la linea de DESCUENTO (condona deuda sin
 * mover plata), su desglose en la cuenta corriente del cliente (PAGO vs
 * AJUSTE_NEGATIVO), sus topes, y el bloqueo de las cuotas reservadas por una
 * liquidacion de sueldo — que si se cobraran por caja se cobrarian dos veces.
 *
 * Uso: npm run test:cobro-cpc-consolidado
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
import { registerCuentasPorCobrarHandlers } from '../electron/handlers/cuentas-por-cobrar.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function esperaError(fn: () => Promise<any>, patron: RegExp, name: string) {
  try {
    await fn();
    ok(false, name, 'no lanzó');
  } catch (e: any) {
    ok(patron.test(e?.message || ''), name, e?.message);
  }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-cobro-cpc-consolidado.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[cobro-cpc] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaCambio } = E('financiero/moneda-cambio.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');
  const { CajaMayorSaldo } = E('financiero/caja-mayor-saldo.entity');
  const { CajaMayorConfiguracion } = E('financiero/caja-mayor-configuracion.entity');
  const { CuentaBancaria } = E('financiero/cuenta-bancaria.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');
  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { LiquidacionSueldo } = E('rrhh/liquidacion-sueldo.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  // ── Seed ──
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  const permisos: Record<string, any> = {};
  for (const cod of ['CAJA_MAYOR_OPERAR', 'CPC_COBRAR', 'CPC_CANCELAR', 'CPC_GESTIONAR', 'CPC_DESCUENTO']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    permisos[cod] = perm;
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'USD', principal: false, decimales: 2, activo: true });
  await save(MonedaCambio, {
    monedaOrigen: usd, monedaDestino: pyg, compraOficial: 7400, ventaOficial: 7600,
    compraLocal: 7500, ventaLocal: 7600, activo: true,
  });

  const efectivo: any = await save(FormasPago, { nombre: 'EFECTIVO', movimentaCaja: true, principal: true, orden: 1, activo: true });
  const caja: any = await save(CajaMayor, { nombre: 'CM CENTRO', estado: 'ABIERTA', fechaApertura: new Date(), responsable: admin, activo: true });
  await save(CajaMayorSaldo, { cajaMayor: caja, moneda: pyg, formaPago: efectivo, saldo: 1_000_000 });
  await save(CajaMayorSaldo, { cajaMayor: caja, moneda: usd, formaPago: efectivo, saldo: 100 });
  const banco: any = await save(CuentaBancaria, {
    nombre: 'CUENTA CORRIENTE', banco: 'ITAU', numeroCuenta: '123456', titular: 'FRC',
    saldo: 2_000_000, moneda: pyg, activo: true,
  });

  const persona: any = await save(Persona, { nombre: 'JUAN', apellido: 'PEREZ', activo: true });
  const cliente: any = await save(Cliente, { persona, saldoActual: 0, activo: true });

  registerCajaMayorHandlers(ds, () => admin);
  registerPagoConsolidadoHandlers(ds, () => admin);
  registerCuentasPorCobrarHandlers(ds, () => admin);

  /** Crea una CPC con N cuotas iguales y deja al cliente debiendo el total. */
  const crearCpc = async (montos: number[], moneda: any = pyg, cli: any = cliente) => {
    const total = montos.reduce((s, m) => s + m, 0);
    const cpc: any = await save(CuentaPorCobrar, {
      cliente: cli, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO', montoTotal: total,
      montoCobrado: 0, cantidadCuotas: montos.length, fechaInicio: new Date(),
      moneda, estado: 'ACTIVO',
    });
    const cuotas: any[] = [];
    for (let i = 0; i < montos.length; i++) {
      cuotas.push(await save(CuentaPorCobrarCuota, {
        cuentaPorCobrar: cpc, numero: i + 1, fechaVencimiento: new Date(),
        monto: montos[i], montoCobrado: 0, estado: 'PENDIENTE',
      }));
    }
    const c: any = await ds.getRepository(Cliente).findOne({ where: { id: cli.id } });
    c.saldoActual = Number(c.saldoActual) + total;
    await ds.getRepository(Cliente).save(c);
    return { cpc, cuotas };
  };

  const saldoDe = async (moneda: any) => {
    const s: any = await ds.getRepository(CajaMayorSaldo).findOne({
      where: { cajaMayor: { id: caja.id }, moneda: { id: moneda.id }, formaPago: { id: efectivo.id } } as any,
    });
    return Number(s?.saldo ?? 0);
  };
  const saldoCliente = async (cli: any = cliente) => {
    const c: any = await ds.getRepository(Cliente).findOne({ where: { id: cli.id } });
    return Number(c?.saldoActual ?? 0);
  };
  const saldoBanco = async () => {
    const b: any = await ds.getRepository(CuentaBancaria).findOne({ where: { id: banco.id } });
    return Number(b?.saldo ?? 0);
  };
  const recargarCuota = async (id: number) =>
    ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id } }) as any;

  // ═══════════ [A] Direccion: cobrar SUBE la caja, anular la BAJA ═══════════
  console.log('\n[A] Cobro de 2 cuotas: la caja sube, la deuda baja');
  {
    const { cpc, cuotas } = await crearCpc([300_000, 200_000, 500_000]);
    const cajaIni = await saldoDe(pyg);
    const clienteIni = await saldoCliente();

    const pend: any[] = await invokeHandler('get-obligaciones-pendientes', 'COBRO_CLIENTE', {});
    ok(pend.length === 3, 'A: las 3 cuotas aparecen pendientes', pend.length);
    ok(pend.every((p) => p.beneficiario === 'JUAN PEREZ'), 'A: el beneficiario es el cliente');
    ok(pend.every((p) => !p.bloqueado), 'A: ninguna bloqueada');

    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 300_000 }, { origenId: cuotas[1].id, monto: 200_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 500_000 }],
      cajaMayorContextoId: caja.id,
    });
    ok(res?.montoTotal === 500_000, 'A: el evento cobra 500.000', res?.montoTotal);
    ok(String(res?.descripcion || '').startsWith('COBRO'), 'A: la etiqueta dice COBRO, no PAGO', res?.descripcion);

    const movs: any[] = await ds.query(
      `SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id} ORDER BY id`);
    ok(movs.length === 1, 'A: un solo movimiento consolidado', movs.length);
    ok(movs[0].tipo_movimiento === 'INGRESO_COBRO_CLIENTE', 'A: el tipo es INGRESO_COBRO_CLIENTE', movs[0].tipo_movimiento);
    ok(await saldoDe(pyg) === cajaIni + 500_000, 'A: la caja SUBIO (es un ingreso)', await saldoDe(pyg));
    ok(await saldoCliente() === clienteIni - 500_000, 'A: la deuda del cliente bajo');

    const c1 = await recargarCuota(cuotas[0].id);
    const c2 = await recargarCuota(cuotas[1].id);
    ok(c1.estado === 'COBRADO' && c2.estado === 'COBRADO', 'A: las 2 cuotas quedaron COBRADO');
    const cpcRec: any = await ds.getRepository(CuentaPorCobrar).findOne({ where: { id: cpc.id } });
    ok(cpcRec.estado === 'ACTIVO', 'A: la CPC sigue ACTIVA (queda una cuota)', cpcRec.estado);
    ok(Number(cpcRec.montoCobrado) === 500_000, 'A: la CPC acumulo lo cobrado');

    const movsCli: any[] = await ds.getRepository(MovimientoCliente).find({
      where: { pagoConsolidadoId: res.id } as any,
    });
    ok(movsCli.length === 2 && movsCli.every((m) => m.tipo === 'PAGO'),
      'A: un PAGO por cuota, ninguno de descuento', movsCli.map((m) => m.tipo));

    // ── Reversa ──
    await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
    ok(await saldoDe(pyg) === cajaIni, 'A: anular DEBITA la caja y la deja como estaba');
    ok(await saldoCliente() === clienteIni, 'A: la deuda del cliente volvio');
    const c1b = await recargarCuota(cuotas[0].id);
    ok(c1b.estado === 'PENDIENTE' && Number(c1b.montoCobrado) === 0, 'A: la cuota volvio a PENDIENTE');
    const anulados: any[] = await ds.getRepository(MovimientoCliente).find({
      where: { pagoConsolidadoId: res.id, anulado: true } as any,
    });
    ok(anulados.length === 2, 'A: los 2 movimientos de cuenta corriente quedaron anulados', anulados.length);
    const compensaciones: any[] = await ds.getRepository(MovimientoCliente).find({
      where: { pagoConsolidadoId: res.id, tipo: 'AJUSTE_POSITIVO' } as any,
    });
    ok(compensaciones.length === 2, 'A: hay una compensacion por cuota, para que el extracto cuadre');
  }

  // ═══════════ [B] Descuento ═══════════
  console.log('\n[B] Cobro con descuento: la cuota se salda sin que entre toda la plata');
  {
    const { cpc, cuotas } = await crearCpc([400_000, 600_000]);
    const cajaIni = await saldoDe(pyg);
    const clienteIni = await saldoCliente();

    // Se deben 1.000.000; entran 900.000 y se perdonan 100.000.
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 400_000 }, { origenId: cuotas[1].id, monto: 600_000 }],
      lineas: [
        { fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 900_000 },
        { fuente: 'DESCUENTO', monedaId: pyg.id, monto: 100_000, cotizacion: 1 },
      ],
      motivoDescuento: 'cliente antiguo',
      cajaMayorContextoId: caja.id,
    });
    ok(res?.montoDescuento === 100_000, 'B: el evento registra el descuento', res?.montoDescuento);
    ok(await saldoDe(pyg) === cajaIni + 900_000, 'B: a la caja entran solo los 900.000 reales');
    ok(await saldoCliente() === clienteIni - 1_000_000, 'B: la deuda baja por el TOTAL, condonado incluido');

    const cabecera: any[] = await ds.query(`SELECT * FROM pagos_consolidados WHERE id = ${res.id}`);
    ok(cabecera[0].motivo_descuento === 'CLIENTE ANTIGUO', 'B: el motivo se guarda en mayusculas', cabecera[0].motivo_descuento);

    const movsDesc: any[] = await ds.query(
      `SELECT * FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id}`);
    ok(movsDesc.length === 1, 'B: el descuento NO genera movimiento de caja', movsDesc.length);

    const dets: any[] = await ds.query(
      `SELECT * FROM pagos_consolidados_detalles WHERE pago_consolidado_id = ${res.id} ORDER BY id`);
    const detDesc = dets.filter((d) => d.fuente === 'DESCUENTO');
    ok(detDesc.length >= 1, 'B: el descuento deja fila de detalle', detDesc.length);
    ok(detDesc.every((d) => d.caja_mayor_movimiento_id == null && d.movimiento_bancario_id == null),
      'B: la fila de descuento no apunta a ningun movimiento');
    // El efectivo imputa primero: la primera cuota se cubre entera con plata.
    ok(Number(detDesc.reduce((s: number, d: any) => s + Number(d.monto_imputado), 0)) === 100_000,
      'B: el descuento imputado suma exactamente lo condonado');

    const c2 = await recargarCuota(cuotas[1].id);
    ok(c2.estado === 'COBRADO', 'B: la cuota alcanzada por el descuento queda COBRADA igual', c2.estado);
    const cpcRec: any = await ds.getRepository(CuentaPorCobrar).findOne({ where: { id: cpc.id } });
    ok(cpcRec.estado === 'COBRADO', 'B: la CPC entera queda COBRADA');

    const movsCli: any[] = await ds.getRepository(MovimientoCliente).find({
      where: { pagoConsolidadoId: res.id } as any, order: { id: 'ASC' } as any,
    });
    const pagos = movsCli.filter((m) => m.tipo === 'PAGO');
    const ajustes = movsCli.filter((m) => m.tipo === 'AJUSTE_NEGATIVO');
    ok(pagos.reduce((s, m) => s + Number(m.monto), 0) === 900_000,
      'B: el extracto muestra 900.000 pagados', pagos.map((m) => m.monto));
    ok(ajustes.reduce((s, m) => s + Number(m.monto), 0) === 100_000,
      'B: y 100.000 condonados, separados del pago', ajustes.map((m) => m.monto));

    const det: any = await invokeHandler('get-pago-consolidado-detalle', res.id);
    ok(det.esIngreso === true, 'B: el detalle sabe que es un cobro');
    ok(det.montoDescuento === 100_000, 'B: el detalle expone el descuento');
    ok(det.lineas.some((l: any) => l.fuente === 'DESCUENTO'), 'B: el descuento sale como linea propia');

    // ── Reversa con descuento: las DOS filas del extracto tienen que revertirse ──
    await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
    ok(await saldoDe(pyg) === cajaIni, 'B: la caja vuelve a su saldo (solo los 900.000 reales)');
    ok(await saldoCliente() === clienteIni, 'B: la deuda vuelve entera, descuento incluido');
    const vivos: any[] = await ds.getRepository(MovimientoCliente).find({
      where: { pagoConsolidadoId: res.id, anulado: false } as any,
    });
    ok(vivos.every((m) => m.tipo === 'AJUSTE_POSITIVO'),
      'B: solo quedan vivas las compensaciones; PAGO y AJUSTE_NEGATIVO quedaron anulados',
      vivos.map((m) => m.tipo));
    const cpcRec2: any = await ds.getRepository(CuentaPorCobrar).findOne({ where: { id: cpc.id } });
    ok(cpcRec2.estado === 'ACTIVO', 'B: la CPC se reabrio');
  }

  console.log('\n[B2] Limites del descuento');
  {
    const { cuotas } = await crearCpc([1_000_000]);
    const linea = (monto: number) =>
      ({ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto });
    const payload = (montoLinea: number, montoDesc: number, extra: any = {}) => ({
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 1_000_000 }],
      lineas: [linea(montoLinea), { fuente: 'DESCUENTO', monedaId: pyg.id, monto: montoDesc, cotizacion: 1 }],
      motivoDescuento: 'promo',
      cajaMayorContextoId: caja.id,
      ...extra,
    });

    await esperaError(() => invokeHandler('registrar-pago-consolidado', payload(900_000, 100_000, { motivoDescuento: '' })),
      /motivo/i, 'B2: el descuento exige motivo');
    await esperaError(() => invokeHandler('registrar-pago-consolidado', payload(0.0001, 1_000_000)),
      /no puede cubrir el total|mayor a 0/i, 'B2: no se puede condonar el 100%');
    await esperaError(() => invokeHandler('registrar-pago-consolidado', {
      concepto: 'GASTO', items: [{ origenId: 999999, monto: 1 }],
      lineas: [{ fuente: 'DESCUENTO', monedaId: pyg.id, monto: 1, cotizacion: 1 }],
    }), /.+/, 'B2: un concepto de egreso no admite descuento');

    // Tope por caja: 5% de 1.000.000 = 50.000.
    await save(CajaMayorConfiguracion, { cajaMayor: caja, descuentoCpcMaxPorcentaje: 5 });
    await esperaError(() => invokeHandler('registrar-pago-consolidado', payload(880_000, 120_000)),
      /tope/i, 'B2: rechaza un descuento por encima del tope de la caja');
    const okRes: any = await invokeHandler('registrar-pago-consolidado', payload(960_000, 40_000));
    ok(okRes?.montoDescuento === 40_000, 'B2: acepta un descuento dentro del tope');
    await invokeHandler('anular-pago-consolidado', okRes.id, 'limpieza');
    // Se saca el tope para no condicionar el resto del test.
    await ds.query(`UPDATE caja_mayor_configuraciones SET descuento_cpc_max_porcentaje = NULL`);
  }

  // ═══════════ [C] Banco: en un cobro la cuenta se ACREDITA ═══════════
  console.log('\n[C] Cobro acreditado a una cuenta bancaria');
  {
    const { cuotas } = await crearCpc([250_000]);
    const bancoIni = await saldoBanco();
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 250_000 }],
      lineas: [{ fuente: 'CUENTA_BANCARIA', monedaId: pyg.id, cuentaBancariaId: banco.id, monto: 250_000 }],
      cajaMayorContextoId: caja.id,
    });
    ok(await saldoBanco() === bancoIni + 250_000, 'C: la cuenta se ACREDITO, no se debito', await saldoBanco());
    const movsB: any[] = await ds.query(
      `SELECT * FROM movimientos_bancarios ORDER BY id DESC LIMIT 1`);
    ok(movsB[0].tipo_movimiento === 'ENTRADA_MANUAL', 'C: el movimiento bancario es una ENTRADA', movsB[0].tipo_movimiento);

    await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
    ok(await saldoBanco() === bancoIni, 'C: anular DEBITA la cuenta y la deja como estaba');
    const movsB2: any[] = await ds.query(`SELECT * FROM movimientos_bancarios ORDER BY id DESC LIMIT 1`);
    ok(movsB2[0].tipo_movimiento === 'AJUSTE_NEGATIVO', 'C: la reversa es un ajuste negativo', movsB2[0].tipo_movimiento);
  }

  // ═══════════ [D] Parcial y multi-moneda ═══════════
  console.log('\n[D] Cobro parcial de una cuota, en dos monedas');
  {
    const { cuotas } = await crearCpc([1_000_000]);
    const cajaPygIni = await saldoDe(pyg);
    const cajaUsdIni = await saldoDe(usd);
    // 600.000 = 300.000 Gs + 40 USD a 7.500
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 600_000 }],
      lineas: [
        { fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 300_000 },
        { fuente: 'CAJA_MAYOR', monedaId: usd.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 40, cotizacion: 7500 },
      ],
      cajaMayorContextoId: caja.id,
    });
    ok(await saldoDe(pyg) === cajaPygIni + 300_000, 'D: entra el efectivo en Gs');
    ok(await saldoDe(usd) === cajaUsdIni + 40, 'D: entran los USD en SU moneda, sin convertir');
    const c = await recargarCuota(cuotas[0].id);
    ok(c.estado === 'PARCIAL' && Number(c.montoCobrado) === 600_000, 'D: la cuota queda PARCIAL', c.estado);

    await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
    ok(await saldoDe(pyg) === cajaPygIni && await saldoDe(usd) === cajaUsdIni, 'D: las dos monedas se restituyen exacto');
    const c2 = await recargarCuota(cuotas[0].id);
    ok(c2.estado === 'PENDIENTE', 'D: la cuota vuelve a PENDIENTE');
  }

  // ═══════════ [E] Guarda cruzada con el cobro viejo ═══════════
  console.log('\n[E] Una cuota cobrada en un evento no se revierte por el camino viejo');
  {
    const { cuotas } = await crearCpc([120_000]);
    const res: any = await invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 120_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 120_000 }],
      cajaMayorContextoId: caja.id,
    });
    await esperaError(() => invokeHandler('anular-cobro-cpc-cuota', { cuotaId: cuotas[0].id, motivo: 'x' }),
      /cobro consolidado|pago consolidado/i, 'E: anular-cobro-cpc-cuota queda bloqueado');

    const movs: any[] = await ds.query(
      `SELECT id FROM cajas_mayor_movimientos WHERE pago_consolidado_id = ${res.id}`);
    await esperaError(() => invokeHandler('anular-caja-mayor-movimiento', movs[0].id, 'x'),
      /pago consolidado/i, 'E: tampoco se puede anular el movimiento suelto');

    await invokeHandler('anular-pago-consolidado', res.id, 'limpieza');
    // Ya anulado el evento, el camino viejo se destraba (no hay detalle activo).
    const cuotaFinal = await recargarCuota(cuotas[0].id);
    ok(cuotaFinal.estado === 'PENDIENTE', 'E: tras anular el evento la cuota vuelve a estar pendiente');
  }

  // ═══════════ [F] Reserva por liquidacion de sueldo ═══════════
  console.log('\n[F] Cuota reservada por una liquidacion de sueldo');
  {
    const personaF: any = await save(Persona, { nombre: 'MARIA', apellido: 'GOMEZ', activo: true });
    const clienteF: any = await save(Cliente, { persona: personaF, saldoActual: 0, activo: true });
    const funcionario: any = await save(Funcionario, { persona: personaF, fechaIngreso: new Date(), salarioBase: 0, activo: true });
    const { cuotas } = await crearCpc([200_000], pyg, clienteF);

    const liq: any = await save(LiquidacionSueldo, {
      funcionario, periodo: '2026-08', estado: 'BORRADOR', monedaPago: pyg,
      fechaInicio: new Date(), fechaFin: new Date(),
      totalHaberes: 0, totalDescuentos: 0, totalNeto: 0,
    });
    await ds.query(`UPDATE cuentas_por_cobrar_cuotas SET liquidacion_id = ${liq.id} WHERE id = ${cuotas[0].id}`);

    const pend: any[] = await invokeHandler('get-obligaciones-pendientes', 'COBRO_CLIENTE', { beneficiarioId: clienteF.id });
    const fila = pend.find((p) => p.origenId === cuotas[0].id);
    ok(!!fila && fila.bloqueado, 'F: la cuota reservada aparece bloqueada en el listado');
    ok(/liquidación de sueldo/i.test(fila?.bloqueoMotivo || ''), 'F: el motivo explica por que', fila?.bloqueoMotivo);

    await esperaError(() => invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: cuotas[0].id, monto: 200_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 200_000 }],
      cajaMayorContextoId: caja.id,
    }), /liquidación de sueldo/i, 'F: el backend la rechaza aunque el cliente insista');

    // Pagada la liquidacion, la reserva ya se consumio: el residual se cobra normal.
    await ds.query(`UPDATE liquidaciones_sueldo SET estado = 'PAGADA' WHERE id = ${liq.id}`);
    const pend2: any[] = await invokeHandler('get-obligaciones-pendientes', 'COBRO_CLIENTE', { beneficiarioId: clienteF.id });
    ok(!pend2.find((p) => p.origenId === cuotas[0].id)?.bloqueado,
      'F: con la liquidacion PAGADA la cuota se destraba');
  }

  // ═══════════ [G] Un cobro = un cliente ═══════════
  console.log('\n[G] Beneficiario unico');
  {
    const personaB: any = await save(Persona, { nombre: 'CARLOS', apellido: 'LOPEZ', activo: true });
    const clienteB: any = await save(Cliente, { persona: personaB, saldoActual: 0, activo: true });
    const a = await crearCpc([100_000]);
    const b = await crearCpc([100_000], pyg, clienteB);

    await esperaError(() => invokeHandler('registrar-pago-consolidado', {
      concepto: 'COBRO_CLIENTE',
      items: [{ origenId: a.cuotas[0].id, monto: 100_000 }, { origenId: b.cuotas[0].id, monto: 100_000 }],
      lineas: [{ fuente: 'CAJA_MAYOR', monedaId: pyg.id, formaPagoId: efectivo.id, cajaMayorId: caja.id, monto: 200_000 }],
      cajaMayorContextoId: caja.id,
    }), /un solo cliente/i, 'G: no se pueden mezclar dos clientes en un cobro');
  }

  await ds.destroy();
  console.log(`\n${failed === 0 ? '✅' : '❌'} cobro-cpc-consolidado: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Error fatal en el E2E de cobro consolidado:', e);
  process.exit(1);
});
