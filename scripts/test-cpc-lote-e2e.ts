/**
 * E2E cancelar-cpc-lote: cancelar CPC en lote, sin cobrar, en una transacción.
 * Simular no escribe; la real exige el esperado de la simulación; salta las que
 * tienen cobros o no están activas; rollback total si falla a mitad.
 *
 * Uso: npm run test:cpc-lote
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { registerCuentasPorCobrarHandlers } from '../electron/handlers/cuentas-por-cobrar.handler';
import { registerMovimientosClienteHandlers } from '../electron/handlers/movimientos-cliente.handler';

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
  const dbFile = path.join(tmpDir, 'test-cpc-lote.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[cpc-lote] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { Permission } = E('personas/permission.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['CPC_COBRAR', 'CPC_CANCELAR', 'CPC_GESTIONAR']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const persona: any = await save(Persona, { nombre: 'EUDELIO', apellido: 'PRUEBA', activo: true });
  const cliente: any = await save(Cliente, { persona, saldoActual: 0, activo: true });
  const persona2: any = await save(Persona, { nombre: 'OTRO', apellido: 'CLIENTE', activo: true });
  const otro: any = await save(Cliente, { persona: persona2, saldoActual: 0, activo: true });
  const sinPerm: any = await save(Usuario, { nickname: 'sinperm', password: 'x', activo: true });

  registerCajaMayorHandlers(ds, () => admin);
  let actual: any = admin;
  registerCuentasPorCobrarHandlers(ds, () => actual);
  registerMovimientosClienteHandlers(ds, () => admin);


  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const crearCpc = async (cli: any, montos: number[], estado = 'ACTIVO', cobrado = 0) => {
    const total = montos.reduce((s, m) => s + m, 0);
    const cpc: any = await save(CuentaPorCobrar, {
      cliente: cli, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO', montoTotal: total,
      montoCobrado: cobrado, cantidadCuotas: montos.length, fechaInicio: new Date(), moneda: pyg, estado,
    });
    for (let i = 0; i < montos.length; i++) {
      await save(CuentaPorCobrarCuota, {
        cuentaPorCobrar: cpc, numero: i + 1, fechaVencimiento: new Date(), monto: montos[i],
        montoCobrado: i === 0 ? cobrado : 0, estado: i === 0 && cobrado > 0 ? 'PARCIAL' : 'PENDIENTE',
      });
    }
    if (estado === 'ACTIVO') {
      const c: any = await ds.getRepository(Cliente).findOne({ where: { id: cli.id } });
      c.saldoActual = Number(c.saldoActual) - cobrado + total;
      await ds.getRepository(Cliente).save(c);
    }
    return cpc;
  };
  const foto = async () => JSON.stringify({
    cpc: await ds.query('SELECT id, estado, motivo_cancelacion FROM cuentas_por_cobrar ORDER BY id'),
    cuotas: await ds.query('SELECT id, estado FROM cuentas_por_cobrar_cuotas ORDER BY id'),
    cli: await ds.query('SELECT id, saldo_actual FROM clientes ORDER BY id'),
    mov: await ds.query('SELECT COUNT(*) AS n FROM movimientos_cliente'),
  });
  const saldo = async (cli: any) => Number((await ds.getRepository(Cliente).findOne({ where: { id: cli.id } }) as any).saldoActual);

  const a1 = await crearCpc(cliente, [10_000, 20_000]);
  const a2 = await crearCpc(cliente, [5_000]);
  const conCobro = await crearCpc(cliente, [7_000, 3_000], 'ACTIVO', 2_000);
  const yaCancelada = await crearCpc(cliente, [9_000], 'CANCELADO');
  const deOtro = await crearCpc(otro, [50_000]);

  console.log('\n[A] Validaciones');
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], simular: true }), /motivo/i, 'sin motivo → error');
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { motivo: 'x', simular: true }), /clienteIds o ids/i, 'sin filtros → error');
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'x' }), /esperado/i, 'real sin esperado → error');
  actual = sinPerm;
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'x', simular: true }), /permis|CPC_CANCELAR/i, 'sin permiso → error');
  actual = admin;

  console.log('\n[B] Simular no escribe nada');
  const antes = await foto();
  const sim: any = await invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'socio 17/11', simular: true });
  ok(sim.simulado === true && sim.cantidadCanceladas === 2, 'simula 2 canceladas', sim.cantidadCanceladas);
  ok(sim.total === 35_000, 'total 35.000', sim.total);
  ok(sim.saltadas.length === 1 && sim.saltadas[0].id === conCobro.id && sim.saltadas[0].razon === 'CON_COBROS', 'salta la que tiene cobros', sim.saltadas);
  const pc = sim.porCliente[0];
  ok(sim.porCliente.length === 1 && pc.saldoAntes === 43_000 && pc.saldoDespues === 8_000, 'porCliente: saldo antes 43.000 → después 8.000', pc);
  ok(sim.totalPorMoneda.length === 1 && sim.totalPorMoneda[0].total === 35_000 && sim.totalPorMoneda[0].monedaId === pyg.id, 'totalPorMoneda', sim.totalPorMoneda);
  ok(sim.motivo === 'SOCIO 17/11', 'motivo en mayúsculas', sim.motivo);
  ok((await foto()) === antes, 'base idéntica después de simular');

  console.log('\n[C] Esperado distinto aborta sin tocar nada');
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'socio', esperado: { cantidad: 3, total: 35_000 } }), /no coincide/i, 'cantidad distinta → error');
  await esperaError(() => invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'socio', esperado: { cantidad: 2, total: 34_000 } }), /no coincide/i, 'total distinto → error');
  ok((await foto()) === antes, 'base idéntica después de abortar');

  console.log('\n[D] Real por cliente');
  const real: any = await invokeHandler('cancelar-cpc-lote', { clienteIds: [cliente.id], motivo: 'socio 17/11', esperado: { cantidad: sim.cantidadCanceladas, total: sim.total } });
  ok(real.simulado === false && real.cantidadCanceladas === 2, 'cancela 2', real.cantidadCanceladas);
  const est: any[] = await ds.query('SELECT id, estado, motivo_cancelacion AS mot FROM cuentas_por_cobrar ORDER BY id');
  const e = (id: number) => est.find((x) => x.id === id);
  ok(e(a1.id).estado === 'CANCELADO' && e(a2.id).estado === 'CANCELADO' && e(a1.id).mot === 'SOCIO 17/11', 'a1 y a2 CANCELADO con motivo');
  ok(e(conCobro.id).estado === 'ACTIVO' && e(deOtro.id).estado === 'ACTIVO', 'la de cobros y la de otro cliente siguen ACTIVO');
  const cq: any[] = await ds.query('SELECT cuenta_por_cobrar_id AS c, estado FROM cuentas_por_cobrar_cuotas');
  ok(cq.filter((x) => [a1.id, a2.id].includes(x.c)).every((x) => x.estado === 'CANCELADO'), 'cuotas de las canceladas → CANCELADO');
  ok(cq.filter((x) => [conCobro.id, deOtro.id].includes(x.c)).every((x) => x.estado !== 'CANCELADO'), 'cuotas de las otras intactas');
  ok(await saldo(cliente) === 8_000 && await saldo(otro) === 50_000, 'saldos: 8.000 y 50.000 (otro intacto)');
  const movs: any[] = await ds.getRepository(MovimientoCliente).find({ relations: ['cliente'] } as any);
  ok(movs.length === 2 && movs.every((x: any) => x.tipo === 'AJUSTE_NEGATIVO' && x.cliente.id === cliente.id), '2 AJUSTE_NEGATIVO del cliente', movs.map((x: any) => x.tipo));
  ok(movs.some((x: any) => x.cuentaPorCobrarId === a1.id && Number(x.monto) === 30_000), 'ajuste con cuentaPorCobrarId y monto');

  console.log('\n[E] Por ids: no existe / no activa / con cobros');
  const r2: any = await invokeHandler('cancelar-cpc-lote', { ids: [deOtro.id, a1.id, yaCancelada.id, conCobro.id, 999999], motivo: 'ids', simular: true });
  const raz = Object.fromEntries(r2.saltadas.map((s: any) => [s.id, s.razon]));
  ok(r2.cantidadCanceladas === 1 && r2.canceladas[0].id === deOtro.id, 'solo deOtro cancelable', r2.canceladas);
  ok(raz[a1.id] === 'NO_ACTIVA' && raz[yaCancelada.id] === 'NO_ACTIVA' && raz[conCobro.id] === 'CON_COBROS' && raz[999999] === 'NO_EXISTE', 'razones', raz);

  console.log('\n[F] Rollback total si falla a mitad');
  const b1 = await crearCpc(otro, [1_000]);
  const antesF = await foto();
  let llamadas = 0;
  // Se rompe el ajuste de saldo en la 2.ª CPC.
  const saldoOrig = require('../electron/utils/saldo-atomico.utils');
  const ajOrig = saldoOrig.ajustarSaldoCliente;
  saldoOrig.ajustarSaldoCliente = async (...a: any[]) => { if (++llamadas === 2) throw new Error('falla simulada'); return ajOrig(...a); };
  let fallo = false;
  try { await invokeHandler('cancelar-cpc-lote', { clienteIds: [otro.id], motivo: 'f', esperado: { cantidad: 2, total: 51_000 } }); } catch { fallo = true; }
  saldoOrig.ajustarSaldoCliente = ajOrig;
  ok(fallo && llamadas >= 2, 'la llamada falla en la 2.ª CPC', { fallo, llamadas });
  ok((await foto()) === antesF, 'no quedó ninguna cancelada (rollback)');
  void b1;

  console.log('\n[G] El handler individual sigue igual');
  const ind: any = await invokeHandler('cancelar-cuenta-por-cobrar', { id: deOtro.id, motivo: 'renuncia' });
  ok(ind?.success === true, 'cancelar-cuenta-por-cobrar devuelve success');
  ok(await saldo(otro) === 1_000, 'saldo del otro baja 50.000', await saldo(otro));

  await ds.destroy();
  console.log(`\n[cpc-lote] ${passed} OK, ${failed} fallas`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
