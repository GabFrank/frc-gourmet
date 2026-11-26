/**
 * Cuotas de compra en guaranies con fraccion (p. ej. 1.136.452,7): el pago
 * consolidado redondea a 0 decimales y el pago tiene que cerrar la cuota, no
 * rebotar ni dejarla PARCIAL por centavos impagables (Don Franco, 25/11/2026).
 *
 * Uso: npm run test:cpp-cuota-centavos
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
import { aplicarEstadoPagoCuota } from '../electron/handlers/cuentas-por-pagar.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-cpp-cuota-centavos.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { CuentaBancaria } = E('financiero/cuenta-bancaria.entity');
  const { Proveedor } = E('compras/proveedor.entity');
  const { CuentaPorPagar } = E('financiero/cuenta-por-pagar.entity');
  const { CuentaPorPagarCuota } = E('financiero/cuenta-por-pagar-cuota.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['CAJA_MAYOR_OPERAR', 'COMPRAS_GESTIONAR']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'USD', principal: false, decimales: 2, activo: true });
  const banco: any = await save(CuentaBancaria, { nombre: 'BNF', banco: 'BNF', numeroCuenta: '1', titular: 'FRC', saldo: 20_000_000, moneda: pyg, activo: true });
  const prov: any = await save(Proveedor, { nombre: 'LA FAMILIA', activo: true });

  registerCajaMayorHandlers(ds, () => admin);
  registerPagoConsolidadoHandlers(ds, () => admin);

  const cuotaDe = async (monto: number, moneda: any = pyg) => {
    const cpp: any = await save(CuentaPorPagar, {
      descripcion: 'COMPRA', tipo: 'COMPRA', proveedor: prov, montoTotal: monto, montoPagado: 0,
      moneda, fechaInicio: new Date(), cantidadCuotas: 1, estado: 'ACTIVO',
    });
    const c: any = await save(CuentaPorPagarCuota, {
      numero: 1, fechaVencimiento: new Date(), monto, montoPagado: 0, estado: 'PENDIENTE', cuentaPorPagar: cpp,
    });
    return { cpp, c };
  };
  const leer = async (x: { cpp: any; c: any }) => ({
    c: await ds.getRepository(CuentaPorPagarCuota).findOne({ where: { id: x.c.id } }) as any,
    cpp: await ds.getRepository(CuentaPorPagar).findOne({ where: { id: x.cpp.id } }) as any,
  });
  const saldoBanco = async () => Number(((await ds.getRepository(CuentaBancaria).findOne({ where: { id: banco.id } })) as any).saldo);
  const pagar = (items: Array<{ origenId: number; monto: number }>, total: number) =>
    invokeHandler('registrar-pago-consolidado', {
      concepto: 'COMPRA', items,
      lineas: [{ fuente: 'CUENTA_BANCARIA', monedaId: pyg.id, cuentaBancariaId: banco.id, monto: total }],
    });

  console.log('\n[A] El caso real: cuotas con ,7 ,5 ,4 ,45 pagadas juntas desde el banco');
  const a = await cuotaDe(1_136_452.7);
  const b = await cuotaDe(498_923.5);
  const c = await cuotaDe(1_095_243.4);
  const d = await cuotaDe(1_517_575.45);
  const e = await cuotaDe(1_232_000);
  const pend: any[] = await invokeHandler('get-obligaciones-pendientes', 'COMPRA');
  const items = pend.map((p) => ({ origenId: p.origenId, monto: Math.round(p.saldoPendiente) })); // lo que manda la UI
  const total = items.reduce((s, i) => s + i.monto, 0);
  const bancoIni = await saldoBanco();
  let res: any = null; let err = '';
  try { res = await pagar(items, total); } catch (ex: any) { err = String(ex?.message || ex); }
  ok(!err, 'A: el pago de las 5 cuotas no rebota', err);
  ok(total === 5_480_195, 'A: total redondeado = 5.480.195', total);
  ok(await saldoBanco() === bancoIni - total, 'A: el banco baja exactamente lo pagado (entero)');
  for (const [n, x] of [['1.136.452,7', a], ['498.923,5', b], ['1.095.243,4', c], ['1.517.575,45', d], ['1.232.000', e]] as any[]) {
    const r = await leer(x);
    ok(r.c.estado === 'PAGADA', `A: cuota ${n} PAGADA`, r.c.estado);
    ok(r.cpp.estado === 'PAGADO', `A: CPP de ${n} PAGADO`, r.cpp.estado);
  }
  const pend2: any[] = await invokeHandler('get-obligaciones-pendientes', 'COMPRA');
  ok(pend2.filter((p) => !p.bloqueado).length === 0, 'A: no queda ninguna pendiente por centavos', pend2);

  console.log('\n[B] Anular el pago vuelve todo a PENDIENTE');
  await invokeHandler('anular-pago-consolidado', res.id, 'prueba');
  ok(await saldoBanco() === bancoIni, 'B: el banco vuelve exacto');
  for (const x of [a, b, c, d]) {
    const r = await leer(x);
    ok(r.c.estado === 'PENDIENTE' && Number(r.c.montoPagado) === 0, `B: cuota ${x.c.monto} PENDIENTE y en 0`, r.c);
    ok(r.cpp.estado === 'ACTIVO', `B: CPP ${x.c.monto} ACTIVO`, r.cpp.estado);
  }

  console.log('\n[C] Límites de la tolerancia (medio guaraní)');
  const qr = ds.createQueryRunner();
  const intentar = async (cuotaId: number, monto: number) => {
    await qr.startTransaction();
    try { await aplicarEstadoPagoCuota(qr, cuotaId, monto, admin, ds); await qr.commitTransaction(); return ''; }
    catch (ex: any) { await qr.rollbackTransaction(); return String(ex?.message || ex); }
  };
  const f = await cuotaDe(1_136_452.7);
  ok(/Monto invalido/.test(await intentar(f.c.id, 1_136_454)), 'C: pagar 1,3 de más se rechaza');
  ok(!(await intentar(f.c.id, 600_000)), 'C: parcial de 600.000 entra');
  ok((await leer(f)).c.estado === 'PARCIAL', 'C: queda PARCIAL');
  ok(!(await intentar(f.c.id, 536_452)), 'C: el segundo parcial deja 0,7 → sigue PARCIAL (no se regala más de medio guaraní)');
  ok((await leer(f)).c.estado === 'PARCIAL', 'C: con 0,7 de saldo sigue PARCIAL', (await leer(f)).c);
  ok(!(await intentar(f.c.id, 1)), 'C: pagar ₲ 1 sobre 0,7 de saldo la cierra');
  ok((await leer(f)).c.estado === 'PAGADA', 'C: PAGADA', (await leer(f)).c);

  const g = await cuotaDe(100.5, usd);
  ok(/Monto invalido/.test(await intentar(g.c.id, 100.51)), 'C: en USD (2 decimales) 0,01 de más se sigue rechazando');
  ok(!(await intentar(g.c.id, 100.5)), 'C: en USD el monto exacto entra');
  ok((await leer(g)).c.estado === 'PAGADA', 'C: USD PAGADA');
  const h = await cuotaDe(100.5, usd);
  ok(!(await intentar(h.c.id, 100.49)), 'C: en USD 0,01 de menos entra');
  ok((await leer(h)).c.estado === 'PARCIAL', 'C: y queda PARCIAL (sin cambio en monedas con decimales)');
  await qr.release();

  await ds.destroy();
  console.log(`\n${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
