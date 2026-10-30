/**
 * E2E #322: cancelar una cuenta por cobrar no debe dejar cuotas abiertas que
 * sigan sumando en el resumen de Caja Mayor ni en las vencidas del cliente.
 *
 * - Al cancelar, las cuotas PENDIENTE/PARCIAL pasan a CANCELADO.
 * - CPC canceladas antes del arreglo (cuotas todavía PENDIENTE) quedan fuera
 *   del resumen y de los conteos por el filtro cpc.estado = ACTIVO.
 * - No se puede cobrar una cuota de una CPC cancelada.
 *
 * Uso: npm run test:cpc-cancelada-cuotas
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
  const dbFile = path.join(tmpDir, 'test-cpc-cancelada-cuotas.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[cpc-cancelada] Migraciones OK.');

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

  registerCajaMayorHandlers(ds, () => admin);
  registerCuentasPorCobrarHandlers(ds, () => admin);
  registerMovimientosClienteHandlers(ds, () => admin);

  const vencida = new Date(Date.now() - 10 * 24 * 3600 * 1000);
  const crearCpc = async (montos: number[], estado = 'ACTIVO') => {
    const total = montos.reduce((s, m) => s + m, 0);
    const cpc: any = await save(CuentaPorCobrar, {
      cliente, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO', montoTotal: total,
      montoCobrado: 0, cantidadCuotas: montos.length, fechaInicio: new Date(),
      moneda: pyg, estado,
    });
    const cuotas: any[] = [];
    for (let i = 0; i < montos.length; i++) {
      cuotas.push(await save(CuentaPorCobrarCuota, {
        cuentaPorCobrar: cpc, numero: i + 1, fechaVencimiento: vencida,
        monto: montos[i], montoCobrado: 0, estado: 'PENDIENTE',
      }));
    }
    if (estado === 'ACTIVO') {
      const c: any = await ds.getRepository(Cliente).findOne({ where: { id: cliente.id } });
      c.saldoActual = Number(c.saldoActual) + total;
      await ds.getRepository(Cliente).save(c);
    }
    return { cpc, cuotas };
  };

  const activa = await crearCpc([100_000]);
  const aCancelar = await crearCpc([20_000, 30_000]);
  // CPC cancelada con el código viejo: estado CANCELADO y cuotas aún PENDIENTE.
  const legado = await crearCpc([500_000], 'CANCELADO');

  console.log('\n[A] Cancelar deja las cuotas en CANCELADO');
  const r = await invokeHandler('cancelar-cuenta-por-cobrar', { id: aCancelar.cpc.id, motivo: 'renuncia' });
  ok(r?.success === true, 'cancelar devuelve success');
  const cuotas = await ds.getRepository(CuentaPorCobrarCuota).find({ where: { cuentaPorCobrar: { id: aCancelar.cpc.id } } as any });
  ok(cuotas.length === 2 && cuotas.every((c: any) => c.estado === 'CANCELADO'), 'las 2 cuotas quedan CANCELADO', cuotas.map((c: any) => c.estado));
  const cuotaActiva: any = await ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id: activa.cuotas[0].id } });
  ok(cuotaActiva.estado === 'PENDIENTE', 'la cuota de otra CPC activa no se toca', cuotaActiva.estado);
  const cli: any = await ds.getRepository(Cliente).findOne({ where: { id: cliente.id } });
  ok(Number(cli.saldoActual) === 100_000, 'saldo del cliente revierte solo lo cancelado', cli.saldoActual);

  console.log('\n[B] Resumen CPC de Caja Mayor suma solo CPC activas');
  const resumen: any[] = await invokeHandler('get-caja-mayor-cpc-resumen');
  const g = resumen.find((x) => x.monedaId === pyg.id);
  ok(g && Number(g.total) === 100_000, 'total = 100.000 (sin la cancelada ni la del legado)', g);
  ok(g && Number(g.vencidas) === 100_000, 'vencidas = 100.000', g);

  console.log('\n[C] Cuotas vencidas del cliente cuentan solo CPC activas');
  const saldo: any = await invokeHandler('get-saldo-cliente', cliente.id);
  ok(saldo.cuotasVencidas === 1, 'get-saldo-cliente: 1 cuota vencida', saldo);
  const ec: any = await invokeHandler('get-cliente-estado-cuenta', cliente.id);
  ok(ec.cuotasVencidas === 1, 'get-cliente-estado-cuenta: 1 cuota vencida', ec.cuotasVencidas);

  console.log('\n[D] No se cobra una cuota de una CPC cancelada');
  await esperaError(
    () => invokeHandler('cobrar-cpc-cuota', {
      cuotaId: legado.cuotas[0].id, montoCobrar: 1000, cajaMayorId: 1, monedaId: pyg.id, formaPagoId: 1,
    }),
    /cancelada/i,
    'cobrar cuota PENDIENTE de CPC cancelada (legado) lanza error',
  );
  await esperaError(
    () => invokeHandler('cobrar-cpc-cuota', {
      cuotaId: aCancelar.cuotas[0].id, montoCobrar: 1000, cajaMayorId: 1, monedaId: pyg.id, formaPagoId: 1,
    }),
    /cancelada/i,
    'cobrar cuota CANCELADO lanza error',
  );
  const cuotaLegado: any = await ds.getRepository(CuentaPorCobrarCuota).findOne({ where: { id: legado.cuotas[0].id } });
  ok(cuotaLegado.estado === 'PENDIENTE', 'el legado no se modifica (sin arreglos retroactivos)', cuotaLegado.estado);

  await ds.destroy();
  console.log(`\n[cpc-cancelada] ${passed} OK, ${failed} fallas`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
