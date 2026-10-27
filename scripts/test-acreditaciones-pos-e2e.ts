/**
 * e2e de acreditaciones POS por medio de pago (issue #320) contra la base real migrada:
 * SQLite por defecto, Postgres con ACRED_PG=<base> (se vacía).
 * Uso: npm run test:acreditaciones-pos-e2e
 */
process.env.TZ = process.env.TZ || 'America/Asuncion';
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerBankingHandlers, procesarAcreditacionesPendientes } from '../electron/handlers/banking.handler';
import { registerAcreditacionesPosReglasHandlers } from '../electron/handlers/acreditaciones-pos-reglas.handler';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { seedSystemData } from '../electron/utils/seed-system';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function lanza(fn: () => Promise<any>, re: RegExp, name: string) {
  try { await fn(); ok(false, name, 'no lanzó'); } catch (e: any) { ok(re.test(String(e?.message)), name, e?.message); }
}
const dia = (d: any) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-acreditaciones-pos-e2e.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['ACRED_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb) { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[acred-e2e] ${pgDb ? 'postgres' : 'sqlite'} TZ=${process.env.TZ}`);
  await ds.runMigrations({ transaction: 'each' });
  await seedPermissions(ds);
  await seedSystemData(ds);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CuentaBancaria } = E('financiero/cuenta-bancaria.entity');
  const { Feriado } = E('rrhh/feriado.entity');
  const { AcreditacionPos } = E('financiero/acreditacion-pos.entity');
  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const rol: any = await ds.getRepository(Role).findOne({ where: { descripcion: 'GERENTE' } as any });
  const usuario: any = await save(Usuario, { nickname: 'U_GERENTE', password: 'x', activo: true });
  await save(UsuarioRole, { usuario, role: rol });
  registerBankingHandlers(ds, () => usuario);
  registerAcreditacionesPosReglasHandlers(ds, () => usuario);

  let moneda: any = await ds.getRepository(Moneda).findOne({ where: { principal: true } as any });
  if (!moneda) moneda = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0 });
  const cuenta: any = await save(CuentaBancaria, { nombre: 'BNF', banco: 'BNF', numeroCuenta: '1', tipoCuenta: 'AHORRO', titular: 'T', saldo: 1000000, saldoReservado: 0, activo: true, moneda });
  const maq = await invokeHandler('create-maquina-pos', { nombre: 'bancard', proveedor: 'bancard', porcentajeComision: 3.5, minutosAcreditacion: 2160, cuentaBancaria: { id: cuenta.id }, activo: true });
  const saldo = async () => Number((await ds.getRepository(CuentaBancaria).findOne({ where: { id: cuenta.id } }) as any).saldo);

  // 1) Sin reglas: idéntico al cálculo anterior.
  const t0 = new Date(2026, 9, 26, 10, 0, 0);
  const a0 = await invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 56000, monedaId: moneda.id, fechaTransaccion: t0, medio: 'CREDITO' });
  ok(Number(a0.montoComision) === 1960 && Number(a0.montoEsperado) === 54040, 'sin regla: % de la máquina (3,5 %) como antes', a0);
  ok(new Date(a0.fechaEsperadaAcreditacion).getTime() === t0.getTime() + 2160 * 60000 && !a0.reglaId, 'sin regla: +2160 minutos, sin regla asociada');
  ok(a0.medio === 'CREDITO', 'guarda el medio aunque no haya regla');
  const a00 = await invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 10000, monedaId: moneda.id, fechaTransaccion: t0 });
  ok(Number(a00.montoEsperado) === 9650 && !a00.medio, 'sin medio (cliente viejo): igual que antes');

  // 2) Reglas observadas.
  const carga = await invokeHandler('cargar-reglas-observadas-pos', maq.id, 'BANCARD');
  const reglas = await invokeHandler('get-maquina-pos-reglas', maq.id);
  const rc = reglas.find((r: any) => r.medio === 'CREDITO');
  const rd = reglas.find((r: any) => r.medio === 'DEBITO');
  ok(carga.creadas === 2 && rc?.activo && rc?.verificada && rd && !rd.activo && !rd.verificada, 'carga Bancard: crédito activa y verificada, débito inactiva y sin verificar', reglas);
  ok((await invokeHandler('cargar-reglas-observadas-pos', maq.id, 'BANCARD')).creadas === 0, 'cargar de nuevo no duplica');
  await lanza(() => invokeHandler('save-maquina-pos-regla', { maquinaPosId: maq.id, medio: 'CREDITO', porcentajeComision: 1 }), /REGLA_DUPLICADA_PARA_MEDIO/, 'una sola regla por medio');
  await lanza(() => invokeHandler('save-maquina-pos-regla', { maquinaPosId: maq.id, medio: 'QR', porcentajeComision: 150 }), /VALOR_FUERA_DE_RANGO/, 'valida rangos');

  // 3) Con regla: montos y fecha del extracto real.
  const a1 = await invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 56000, monedaId: moneda.id, fechaTransaccion: t0, medio: 'credito', marca: 'visa', cuotas: 1 });
  ok([a1.montoComision, a1.montoIvaComision, a1.montoRetRenta, a1.montoRetIva, a1.montoEsperado].map(Number).join() === '1680,168,560,509,53083', 'regla Bancard crédito: 56.000 → 53.083 con desglose', a1);
  ok(dia(a1.fechaEsperadaAcreditacion) === '2026-10-28' && a1.reglaId === rc.id && a1.marca === 'VISA' && a1.cuotas === 1, 'fecha esperada 28/10 (2 hábiles), regla, marca y cuotas guardadas');
  const a2 = await invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 100000, monedaId: moneda.id, fechaTransaccion: t0, medio: 'DEBITO' });
  ok(Number(a2.montoEsperado) === 96500 && !a2.reglaId, 'regla inactiva (débito sin verificar): usa el cálculo de la máquina');
  await save(Feriado, { fecha: '2026-10-27', descripcion: 'PRUEBA', esNacional: true, recargoPorcentaje: 100, activo: true });
  const a3 = await invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 17940, monedaId: moneda.id, fechaTransaccion: t0, medio: 'CREDITO' });
  ok(dia(a3.fechaEsperadaAcreditacion) === '2026-10-29' && Number(a3.montoEsperado) === 17015, 'feriado activo corre la fecha un día hábil', { f: a3.fechaEsperadaAcreditacion });
  await lanza(() => invokeHandler('create-acreditacion-pos', { maquinaPosId: maq.id, montoOriginal: 100, monedaId: 99999, medio: 'CREDITO' }), /MONEDA_NO_COINCIDE_CON_CUENTA/, 'mantiene el control de moneda');

  // 4) auto_acreditar = false: lo vencido no se suma solo.
  const s0 = await saldo();
  await invokeHandler('update-maquina-pos', maq.id, { autoAcreditar: false });
  const r1 = await procesarAcreditacionesPendientes(ds);
  ok(r1.procesadas === 0 && (await saldo()) === s0, 'auto_acreditar=false: el scheduler no toca saldo ni estado');
  await invokeHandler('update-maquina-pos', maq.id, { autoAcreditar: true });
  // Con auto (como hoy), las vencidas sin conciliar se suman.
  const pendAntes = await ds.getRepository(AcreditacionPos).count({ where: { estado: 'PENDIENTE' } as any });
  ok(pendAntes === 5, 'cinco acreditaciones pendientes', pendAntes);

  // 5) Conciliación agrupada (con auto=false de nuevo para que no se adelante el scheduler).
  await invokeHandler('update-maquina-pos', maq.id, { autoAcreditar: false });
  const sug = await invokeHandler('sugerir-conciliacion-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-28', montoCredito: 53083 + 54040 });
  ok(sug.sugeridas.includes(a1.id) && sug.candidatas.length >= 2, 'sugerencia: incluye la de la fecha exacta', sug.sugeridas);
  const s1 = await saldo();
  const conc = await invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-28', montoCredito: 53083 + 54040 - 10, referencia: 'res 751587808', acreditacionIds: [a1.id, a0.id] });
  const [c0, c1] = await Promise.all([a0.id, a1.id].map((id) => ds.getRepository(AcreditacionPos).findOne({ where: { id } })));
  ok((await saldo()) === s1 + 107113 && Number(conc.diferencia) === -10, 'conciliar suma el crédito real al saldo y guarda la diferencia', { s: await saldo(), conc });
  ok(c0!.estado === 'VERIFICADO' && c1!.estado === 'CON_DIFERENCIA' && Number(c1!.diferencia) === -10 && c0!.conciliacionId === conc.id, 'acreditaciones verificadas, la diferencia queda en la última', [c0, c1]);
  await lanza(() => invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-28', montoCredito: 100, acreditacionIds: [a1.id] }), /CONCILIACION_YA_PROCESADA/, 'una acreditación no se concilia dos veces');
  await lanza(() => invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-28', montoCredito: 107113, referencia: 'RES 751587808', acreditacionIds: [a3.id] }), /CONCILIACION_DUPLICADA/, 'el mismo crédito no se concilia dos veces');
  await lanza(() => invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id + 999, fechaCredito: '2026-10-28', montoCredito: 10, acreditacionIds: [a3.id] }), /CONCILIACION_OTRA_CUENTA/, 'no mezcla cuentas');
  const s2 = await saldo();
  await lanza(() => invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-29', montoCredito: 10, acreditacionIds: [a3.id, 999999] }), /NO_ENCONTRADA/, 'id inexistente: no concilia nada');
  ok((await saldo()) === s2 && (await ds.getRepository(AcreditacionPos).findOne({ where: { id: a3.id } }))!.estado === 'PENDIENTE', 'el error no deja cambios a medias');

  // 6) Deshacer.
  await invokeHandler('deshacer-conciliacion-pos', conc.id);
  const [d0, d1] = await Promise.all([a0.id, a1.id].map((id) => ds.getRepository(AcreditacionPos).findOne({ where: { id } })));
  ok((await saldo()) === s1 && d0!.estado === 'PENDIENTE' && d1!.estado === 'PENDIENTE' && !d1!.conciliacionId && d1!.montoAcreditado == null, 'deshacer: saldo vuelve y las acreditaciones quedan pendientes');
  await lanza(() => invokeHandler('deshacer-conciliacion-pos', conc.id), /CONCILIACION_YA_DESHECHA/, 'no se deshace dos veces');
  const conc2 = await invokeHandler('conciliar-acreditaciones-pos', { cuentaBancariaId: cuenta.id, fechaCredito: '2026-10-28', montoCredito: 53083, referencia: 'res 751587808', acreditacionIds: [a1.id] });
  ok(Number(conc2.diferencia) === 0, 'tras deshacer, se puede volver a conciliar');
  const lista = await invokeHandler('get-conciliaciones-pos', cuenta.id);
  ok(lista.length === 2 && lista.some((c: any) => c.estado === 'DESHECHA'), 'historial con la deshecha y la activa');

  // 7) Resumen.
  const res = await invokeHandler('get-resumen-acreditaciones-pos', { desde: '2026-10-01', hasta: '2026-10-31' });
  ok(res.totales.cantidad === 5 && res.totales.retRenta === 560 + 179 && res.totales.retIva === 509 + 163, 'resumen: retenciones del mes', res.totales);
  ok(res.pendientePorCuentaYFecha.length >= 1 && /contador/.test(res.nota), 'resumen: pendiente por cuenta y fecha, rotulado informativo');

  // 8) Auto = true de nuevo: comportamiento de siempre con las vencidas.
  await invokeHandler('update-maquina-pos', maq.id, { autoAcreditar: true });
  await ds.getRepository(AcreditacionPos).update({ id: a3.id }, { fechaEsperadaAcreditacion: new Date(2026, 0, 1) } as any);
  const s3 = await saldo();
  const r2 = await procesarAcreditacionesPendientes(ds);
  ok(r2.procesadas >= 1 && (await saldo()) >= s3 + 17015, 'auto_acreditar=true: vencidas se acreditan solas como antes');

  await ds.destroy();
  console.log(`\n[acred-e2e] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
