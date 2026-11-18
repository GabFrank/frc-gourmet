/**
 * E2E fusionar-clientes: une dos fichas de cliente (origen → destino) en una
 * transacción. Simular no escribe; la real exige el saldo esperado del destino;
 * mueve CPC (con cuotas), movimientos, ventas y convenios; recalcula saldos y
 * desactiva el origen.
 *
 * Uso: npm run test:fusionar-clientes
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
  const dbFile = path.join(tmpDir, 'test-fusionar-clientes.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[fusionar-clientes] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { Permission } = E('personas/permission.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cliente } = E('personas/cliente.entity');
  const { Convenio } = E('personas/convenio.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CuentaPorCobrar } = E('financiero/cuenta-por-cobrar.entity');
  const { CuentaPorCobrarCuota } = E('financiero/cuenta-por-cobrar-cuota.entity');
  const { MovimientoCliente } = E('financiero/movimiento-cliente.entity');
  const { Venta } = E('ventas/venta.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['CPC_COBRAR', 'CPC_CANCELAR', 'CPC_GESTIONAR']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });
  const sinPerm: any = await save(Usuario, { nickname: 'sinperm', password: 'x', activo: true });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const cli = async (nombre: string, doc: string, activo = true) =>
    save(Cliente, { persona: await save(Persona, { nombre, documento: doc, activo: true }), saldoActual: 0, activo });
  const origen: any = await cli('JONATAN', '123123');
  const destino: any = await cli('JHONATAN DIAZ', '5555555');
  const tercero: any = await cli('OTRO', '777');
  const inactivo: any = await cli('INACTIVO', '888', false);
  const conv: any = await save(Convenio, { nombre: 'FUNCIONARIOS BODEGA', activo: true });
  const conv2: any = await save(Convenio, { nombre: 'OTRO CONVENIO', activo: true });
  await ds.query('INSERT INTO cliente_convenios (cliente_id, convenio_id) VALUES (?, ?), (?, ?), (?, ?)',
    [origen.id, conv.id, origen.id, conv2.id, destino.id, conv.id]);

  let actual: any = admin;
  registerCajaMayorHandlers(ds, () => admin);
  registerCuentasPorCobrarHandlers(ds, () => actual);
  registerMovimientosClienteHandlers(ds, () => admin);

  // CPC con su CARGO, como deja una venta a crédito.
  const crearCpc = async (c: any, montos: number[], estado = 'ACTIVO') => {
    const total = montos.reduce((s, m) => s + m, 0);
    const cpc: any = await save(CuentaPorCobrar, {
      cliente: c, tipo: 'CREDITO_VENTA', descripcion: 'CONSUMO', montoTotal: total,
      montoCobrado: 0, cantidadCuotas: montos.length, fechaInicio: new Date(), moneda: pyg, estado,
    });
    for (let i = 0; i < montos.length; i++) {
      await save(CuentaPorCobrarCuota, { cuentaPorCobrar: cpc, numero: i + 1, fechaVencimiento: new Date(), monto: montos[i], montoCobrado: 0, estado: 'PENDIENTE' });
    }
    await save(MovimientoCliente, { cliente: c, tipo: 'CARGO', monto: total, fecha: new Date(), cuentaPorCobrarId: cpc.id });
    await ds.query('UPDATE clientes SET saldo_actual = saldo_actual + ? WHERE id = ?', [total, c.id]);
    return cpc;
  };
  await crearCpc(origen, [100_000, 50_000]);
  await crearCpc(origen, [129_750]);
  await crearCpc(destino, [491_000]);
  await crearCpc(tercero, [9_000]);
  // Un pago parcial en el origen
  await save(MovimientoCliente, { cliente: origen, tipo: 'PAGO', monto: 10_000, fecha: new Date() });
  await ds.query('UPDATE clientes SET saldo_actual = saldo_actual - 10000 WHERE id = ?', [origen.id]);
  let ventaId: number | null = null;
  try {
    const v: any = await save(Venta, { cliente: origen, estado: 'CONCLUIDA' });
    ventaId = v.id;
  } catch (e: any) {
    console.log('  (sin venta de prueba:', e?.message, ')');
  }

  const foto = async () => JSON.stringify({
    cpc: await ds.query('SELECT id, cliente_id, estado FROM cuentas_por_cobrar ORDER BY id'),
    cuotas: await ds.query('SELECT id, cuenta_por_cobrar_id, estado FROM cuentas_por_cobrar_cuotas ORDER BY id'),
    cli: await ds.query('SELECT id, saldo_actual, activo FROM clientes ORDER BY id'),
    mov: await ds.query('SELECT id, cliente_id FROM movimientos_cliente ORDER BY id'),
    ven: await ds.query('SELECT id, cliente_id FROM ventas ORDER BY id'),
    conv: await ds.query('SELECT cliente_id, convenio_id FROM cliente_convenios ORDER BY cliente_id, convenio_id'),
  });
  const ficha = async (id: number) => (await ds.query('SELECT saldo_actual, activo FROM clientes WHERE id = ?', [id]))[0];

  console.log('\n[A] Validaciones');
  await esperaError(() => invokeHandler('fusionar-clientes', { destinoId: destino.id, simular: true }), /origenId y destinoId/, 'sin origen → error');
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: origen.id, simular: true }), /mismo cliente/, 'mismo id → error');
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: 9999, destinoId: destino.id, simular: true }), /no encontrado/, 'origen inexistente → error');
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: inactivo.id, simular: true }), /inactivo/, 'destino inactivo → error');
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: destino.id }), /esperado/, 'real sin esperado → error');
  actual = sinPerm;
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: destino.id, simular: true }), /permis|CPC_GESTIONAR/i, 'sin permiso → error');
  actual = admin;

  console.log('\n[B] Simular no escribe nada');
  const antes = await foto();
  const sim: any = await invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: destino.id, motivo: 'misma persona', simular: true });
  ok(sim.simulado === true, 'simulado');
  ok(sim.origen.saldoAntes === 269_750 && sim.origen.saldoDespues === 0, 'origen 269.750 → 0', sim.origen);
  ok(sim.destino.saldoAntes === 491_000 && sim.destino.saldoDespues === 760_750, 'destino 491.000 → 760.750', sim.destino);
  ok(sim.destino.documento === '5555555' && sim.origen.nombre === 'JONATAN', 'muestra nombre y documento');
  ok(sim.movidos.cpc === 2 && sim.movidos.cuotas === 3 && sim.movidos.movimientos === 3, 'cuenta 2 CPC, 3 cuotas, 3 movimientos', sim.movidos);
  ok(sim.movidos.pendienteCpcActivas === 279_750, 'pendiente CPC activas 279.750', sim.movidos);
  ok(sim.movidos.conveniosAgregadosAlDestino === 1, 'agrega 1 convenio al destino', sim.movidos);
  ok(sim.respaldo.cpcIds.length === 2 && sim.respaldo.origen.saldoActual === 269_750, 'respaldo con ids y saldo previo');
  if (ventaId) ok(sim.movidos.ventas === 1, 'cuenta la venta');
  ok((await foto()) === antes, 'no cambió nada (rollback)');

  console.log('\n[C] Esperado distinto → no toca nada');
  await esperaError(() => invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: destino.id, esperado: { saldoDestino: 760_000 } }), /No coincide/, 'esperado distinto → error');
  ok((await foto()) === antes, 'sigue igual');

  console.log('\n[D] Real');
  const r: any = await invokeHandler('fusionar-clientes', { origenId: origen.id, destinoId: destino.id, esperado: { saldoDestino: sim.destino.saldoDespues } });
  ok(r.simulado === false && r.destino.saldoDespues === 760_750, 'devuelve saldo 760.750');
  const fo = await ficha(origen.id), fd = await ficha(destino.id);
  ok(Number(fo.saldo_actual) === 0 && !fo.activo, 'origen en 0 e inactivo', fo);
  ok(Number(fd.saldo_actual) === 760_750 && !!fd.activo, 'destino 760.750 y activo', fd);
  const q = async (sql: string, id: number) => Number((await ds.query(sql, [id]))[0].n);
  ok(await q('SELECT COUNT(*) AS n FROM cuentas_por_cobrar WHERE cliente_id = ?', origen.id) === 0, 'origen sin CPC');
  ok(await q('SELECT COUNT(*) AS n FROM cuentas_por_cobrar WHERE cliente_id = ?', destino.id) === 3, 'destino con 3 CPC');
  ok(await q('SELECT COUNT(*) AS n FROM cuentas_por_cobrar_cuotas q JOIN cuentas_por_cobrar c ON c.id = q.cuenta_por_cobrar_id WHERE c.cliente_id = ?', destino.id) === 4, 'cuotas siguen colgando (4)');
  ok(await q('SELECT COUNT(*) AS n FROM movimientos_cliente WHERE cliente_id = ?', origen.id) === 0, 'origen sin movimientos');
  if (ventaId) ok(await q('SELECT COUNT(*) AS n FROM ventas WHERE cliente_id = ?', destino.id) === 1, 'venta en el destino');
  ok(await q('SELECT COUNT(*) AS n FROM cliente_convenios WHERE cliente_id = ?', origen.id) === 0, 'origen fuera de convenios');
  ok(await q('SELECT COUNT(*) AS n FROM cliente_convenios WHERE cliente_id = ?', destino.id) === 2, 'destino en los 2 convenios, sin duplicar');
  ok(Number((await ficha(tercero.id)).saldo_actual) === 9_000, 'no toca a otro cliente');
  const rec: any = await invokeHandler('recalcular-saldo-cliente', destino.id);
  ok(rec.saldoRecalculado === 760_750, 'recalcular-saldo-cliente da lo mismo', rec);

  await ds.destroy();
  console.log(`\n[fusionar-clientes] ${passed} OK, ${failed} fallas`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
