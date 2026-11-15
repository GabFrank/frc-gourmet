/**
 * #350 — editar y cerrar una caja mayor (docs/planes/PLAN-350-update-caja-mayor.md).
 *
 * - update-caja-mayor: solo nombre y descripcion; estado, fechas, responsable, activo y saldos → CAMPO_NO_EDITABLE.
 * - cerrar-caja-mayor: valida (inactiva, ya cerrada) y es atomico (dos cierres simultaneos → uno solo).
 * - create-caja-mayor: ignora id, estado y fechas que manden.
 *
 * Uso: npm run test:caja-mayor-update  (Postgres: CM_PG=<base vacia> npm run test:caja-mayor-update)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function falla(p: Promise<any>, re: RegExp): Promise<string | null> {
  try { await p; return null; } catch (e: any) { const m = String(e?.message || e); return re.test(m) ? m : `otro error: ${m}`; }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-caja-mayor-update.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['CM_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  console.log(`[caja-mayor] ${pgDb ? 'postgres' : 'sqlite'}`);
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { Permission } = E('personas/permission.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { CajaMayor } = E('financiero/caja-mayor.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const otro: any = await save(Usuario, { nickname: 'otro', password: 'x', activo: true });
  const sinPermiso: any = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  const perm: any = await save(Permission, { codigo: 'FINANCIERO_CAJA_GESTIONAR', descripcion: 'x', activo: true });
  await save(RolePermission, { role, permission: perm });
  await save(UsuarioRole, { usuario: admin, role });
  let actual: any = admin;
  registerCajaMayorHandlers(ds, () => actual);
  const leer = (id: number) => ds.getRepository(CajaMayor).findOne({ where: { id }, relations: ['responsable', 'updatedBy'] }) as Promise<any>;

  // create
  console.log('[caja-mayor] create');
  const c1: any = await invokeHandler('create-caja-mayor', { nombre: 'CAJA UNO', descripcion: 'PRINCIPAL' });
  await ds.getRepository(CajaMayor).update(c1.id, { responsable: { id: admin.id } } as any);
  ok(c1?.id && c1.estado === 'ABIERTA', 'crea ABIERTA', c1);
  const c2: any = await invokeHandler('create-caja-mayor', { id: c1.id, nombre: 'INTRUSA', estado: 'CERRADA', fechaCierre: new Date(), activo: false });
  const r1 = await leer(c1.id);
  ok(c2.id !== c1.id && r1.nombre === 'CAJA UNO', 'create con id ajeno crea otra y no pisa la existente', { c2: c2.id, n: r1.nombre });
  ok(c2.estado === 'ABIERTA' && !c2.fechaCierre && c2.activo !== false, 'create ignora estado/fechaCierre/activo', c2);
  const c2r = await leer(c2.id);
  const c5: any = await invokeHandler('create-caja-mayor', { nombre: 'CINCO', responsable: { id: otro.id } });
  ok((await leer(c5.id)).responsable == null && c2r.id === c2.id, 'create ignora responsable que mandan');

  // update permitido
  console.log('[caja-mayor] update');
  const antes = await leer(c1.id);
  actual = otro; // sin permiso
  ok(!!(await falla(invokeHandler('update-caja-mayor', c1.id, { nombre: 'X' }), /PERMISO/)), 'sin permiso → rechazado');
  actual = admin;
  const u1: any = await invokeHandler('update-caja-mayor', c1.id, { nombre: '  caja central ', descripcion: 'la de arriba', updatedAt: new Date(0) });
  const r2 = await leer(c1.id);
  ok(r2.nombre === 'CAJA CENTRAL' && r2.descripcion === 'LA DE ARRIBA', 'nombre/descripcion en mayúsculas', r2);
  ok(r2.estado === 'ABIERTA' && String(r2.fechaApertura) === String(antes.fechaApertura) && r2.responsable?.id === admin.id, 'estado, apertura y responsable intactos');
  ok(r2.updatedBy?.id === admin.id, 'updated_by = quien editó', r2.updatedBy);
  ok(u1?.nombre === 'CAJA CENTRAL', 'devuelve la caja actualizada');
  ok(!!(await falla(invokeHandler('update-caja-mayor', c1.id, { nombre: '   ' }), /obligatorio/)), 'nombre vacío → error');
  for (const [campo, valor] of [['estado', 'CERRADA'], ['fechaCierre', new Date()], ['responsable', { id: otro.id }], ['activo', false], ['saldos', []], ['fechaApertura', new Date(0)], ['id', 99999]] as [string, any][]) {
    const m = await falla(invokeHandler('update-caja-mayor', c1.id, { nombre: 'NO', [campo]: valor }), /CAMPO_NO_EDITABLE/);
    ok(!!m && !m.startsWith('otro'), `update con ${campo} → CAMPO_NO_EDITABLE`, m);
  }
  const r3 = await leer(c1.id);
  ok(r3.nombre === 'CAJA CENTRAL' && r3.estado === 'ABIERTA' && r3.activo !== false && r3.responsable?.id === admin.id, 'tras los rechazos nada cambió', r3);
  ok(!!(await falla(invokeHandler('update-caja-mayor', 99999, { nombre: 'X' }), /not found/)), 'caja inexistente → error');

  // cerrar
  console.log('[caja-mayor] cerrar');
  const cerrada: any = await invokeHandler('cerrar-caja-mayor', c1.id);
  const r4 = await leer(c1.id);
  ok(cerrada?.estado === 'CERRADA' && r4.estado === 'CERRADA' && !!r4.fechaCierre, 'cierra una ABIERTA', r4);
  ok(r4.updatedBy?.id === admin.id, 'cierre a nombre de quien cerró');
  await new Promise((r) => setTimeout(r, 1100));
  ok(!!(await falla(invokeHandler('cerrar-caja-mayor', c1.id), /CAJA_MAYOR_YA_CERRADA/)), 'cerrar otra vez → CAJA_MAYOR_YA_CERRADA');
  const r5 = await leer(c1.id);
  ok(new Date(r5.fechaCierre).getTime() === new Date(r4.fechaCierre).getTime(), 'el segundo cierre no pisa fechaCierre');
  ok(!!(await falla(invokeHandler('update-caja-mayor', c1.id, { estado: 'ABIERTA' }), /CAMPO_NO_EDITABLE/)) && (await leer(c1.id)).estado === 'CERRADA', 'no se reabre por update');
  const u2: any = await invokeHandler('update-caja-mayor', c1.id, { descripcion: 'HISTORICA' });
  ok(u2?.descripcion === 'HISTORICA' && u2.estado === 'CERRADA', 'cerrada: se puede renombrar/describir');
  await ds.getRepository(CajaMayor).update(c2.id, { activo: false });
  ok(!!(await falla(invokeHandler('cerrar-caja-mayor', c2.id), /CAJA_MAYOR_INACTIVA/)), 'inactiva → CAJA_MAYOR_INACTIVA');
  actual = sinPermiso;
  const c3id = (await save(CajaMayor, { nombre: 'TRES', estado: 'ABIERTA', fechaApertura: new Date(), activo: true })).id;
  ok(!!(await falla(invokeHandler('cerrar-caja-mayor', c3id), /PERMISO/)), 'cerrar sin permiso → rechazado');
  actual = admin;

  // cliente viejo: update({estado:'CERRADA', fechaCierre}) → cierre validado
  const c4id = (await save(CajaMayor, { nombre: 'CUATRO', estado: 'ABIERTA', fechaApertura: new Date(), activo: true })).id;
  const viejo: any = await invokeHandler('update-caja-mayor', c4id, { estado: 'CERRADA', fechaCierre: new Date(0) });
  const r6 = await leer(c4id);
  ok(viejo?.estado === 'CERRADA' && r6.estado === 'CERRADA' && new Date(r6.fechaCierre).getFullYear() > 2000, 'cliente viejo cierra por update → cierre validado con hora del servidor', r6);
  ok(!!(await falla(invokeHandler('update-caja-mayor', c4id, { estado: 'CERRADA', fechaCierre: new Date() }), /CAJA_MAYOR_YA_CERRADA/)), 'cliente viejo, segunda vez → CAJA_MAYOR_YA_CERRADA');
  ok(!!(await falla(invokeHandler('update-caja-mayor', c1.id, { nombre: 'X'.repeat(101) }), /100 caracteres/)), 'nombre de más de 100 → error claro');

  // concurrencia: el UPDATE condicional deja pasar uno solo
  const res = await Promise.allSettled([invokeHandler('cerrar-caja-mayor', c3id), invokeHandler('cerrar-caja-mayor', c3id), invokeHandler('cerrar-caja-mayor', c3id)]);
  const okN = res.filter((r) => r.status === 'fulfilled').length;
  const yaN = res.filter((r) => r.status === 'rejected' && /CAJA_MAYOR_YA_CERRADA/.test(String((r as any).reason?.message))).length;
  ok(okN === 1 && yaN === 2, 'tres cierres simultáneos → 1 cierra, 2 YA_CERRADA', { okN, yaN });

  await ds.destroy();
  console.log(`\n[caja-mayor] ${passed} ok, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
