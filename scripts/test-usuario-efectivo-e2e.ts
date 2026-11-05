/**
 * #341: por /api/rpc, los handlers tienen que ver al usuario del request
 * (AsyncLocalStorage, `withRequestUser`) y no al operador logueado en la
 * consola del servidor. `registerAllAppHandlers` envuelve el `getCurrentUser`
 * con `getEffectiveUser`, así ningún handler lee el global dentro de un request.
 *
 * Patrón de test-permissions-e2e: SQLite tmp + ipcMain mock + registerAllAppHandlers.
 *
 * Uso: npm run test:usuario-efectivo   (exit 0 si todo OK)
 */
import './_electron-mock';
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { handlerRegistry } from '../electron/utils/handler-registry';


import { getDataSourceOptions } from '../src/app/database/database.config';
import { Usuario } from '../src/app/database/entities/personas/usuario.entity';
import { Persona } from '../src/app/database/entities/personas/persona.entity';
import { Role } from '../src/app/database/entities/personas/role.entity';
import { UsuarioRole } from '../src/app/database/entities/personas/usuario-role.entity';
import { hashPassword } from '../electron/utils/password.utils';
import { clearPermissionCache, withRequestUser } from '../electron/utils/auth.utils';
import { registerAllAppHandlers } from '../electron/utils/register-all-handlers';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { seedSystemData } from '../electron/utils/seed-system';

const results: { name: string; ok: boolean; detail?: string }[] = [];

function pass(name: string) {
  results.push({ name, ok: true });
  console.log(`  \x1b[32m✓\x1b[0m ${name}`);
}

function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
  console.log(`  \x1b[31m✗\x1b[0m ${name}`);
  console.log(`    \x1b[31m${detail}\x1b[0m`);
}

async function expectRechazo(channel: string, args: any[], fragmento: string, name: string) {
  const fn = handlerRegistry.get(channel);
  if (!fn) return fail(name, `Handler '${channel}' no registrado`);
  try {
    const r = await fn({ sender: { id: -1 } }, ...args);
    if (r && r.success === false && String(r.message || r.error || '').includes(fragmento)) return pass(name);
    fail(name, `Esperado rechazo "${fragmento}", recibido: ${JSON.stringify(r)?.slice(0, 200)}`);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes(fragmento)) pass(name);
    else fail(name, `Esperado "${fragmento}", recibido: "${msg}"`);
  }
}

async function expectSinRechazoDePermiso(channel: string, args: any[], name: string) {
  const fn = handlerRegistry.get(channel);
  if (!fn) return fail(name, `Handler '${channel}' no registrado`);
  try {
    const r = await fn({ sender: { id: -1 } }, ...args);
    const m = String(r?.message || r?.error || '');
    if (r && r.success === false && /NO_PERMISSION|PERMISO|autenticado/i.test(m)) return fail(name, `Rebotó: ${m}`);
    pass(name);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (/NO_PERMISSION|PERMISO|autenticado/i.test(msg)) fail(name, `Rebotó: "${msg}"`);
    else pass(`${name} (falló por dominio: "${msg.slice(0, 50)}")`);
  }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-usuario-efectivo.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const dataSource = new DataSource({
    ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false,
  });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await seedPermissions(dataSource);
  await seedSystemData(dataSource);

  const userRepo = dataSource.getRepository(Usuario);
  const admin = await userRepo.findOne({ where: { nickname: 'admin' } });
  if (!admin) { console.error('FATAL: admin no seedeado'); process.exit(1); }
  await userRepo.update({ id: admin.id }, { mustChangePassword: false } as any);
  (admin as any).mustChangePassword = false;

  const persona = await dataSource.getRepository(Persona).save({ nombre: 'CAJERO', apellido: 'EFECTIVO', activo: true } as any);
  const cajero = await userRepo.save(userRepo.create({
    persona, nickname: 'cajero_efectivo', password: await hashPassword('cajero'), activo: true,
  } as any)) as unknown as Usuario;
  const rolCajero = await dataSource.getRepository(Role).findOne({ where: { descripcion: 'CAJERO' } });
  if (!rolCajero) { console.error('FATAL: rol CAJERO no seedeado'); process.exit(1); }
  await dataSource.getRepository(UsuarioRole).save({ usuario: cajero, role: rolCajero } as any);
  // El cajero no tiene permisos de gastos (si el seed se los diera, el caso 1 no probaría nada).
  const permisosCajero = await dataSource.query(
    `SELECT p.codigo FROM permissions p JOIN role_permissions rp ON rp.permission_id = p.id
      WHERE rp.role_id = ? AND p.codigo IN ('CAJA_MAYOR_OPERAR','FINANCIERO_GASTO_VER')`, [rolCajero.id]);
  if (permisosCajero.length) { console.error('FATAL: el rol CAJERO tiene permisos de gastos'); process.exit(1); }

  // Como en la app: el registro recibe el getter del global del main process.
  let consola: Usuario | null = admin;
  registerAllAppHandlers({ dataSource, getCurrentUser: () => consola, setCurrentUser: (u) => { consola = u; } });

  console.log('\n=== #341 usuario efectivo ===\n');

  // 1. Consola = admin, request = cajero: get-gasto chequea permisos a mano con
  //    getCurrentUser(). Antes autorizaba con los permisos de la consola.
  consola = admin;
  await withRequestUser(cajero, () => expectRechazo('get-gasto', [1], 'NO_PERMISSION',
    'request=cajero, consola=admin → get-gasto rechaza (no usa los permisos de la consola)'));
  await withRequestUser(cajero, () => expectRechazo('get-vale', [1], 'NO_PERMISSION',
    'request=cajero, consola=admin → get-vale rechaza'));

  // 2. Consola sin sesión, request = admin: antes «Usuario no autenticado».
  consola = null;
  clearPermissionCache(admin.id);
  await withRequestUser(admin, () => expectSinRechazoDePermiso('get-gasto', [1],
    'request=admin, consola sin sesión → get-gasto no rebota por «no autenticado»'));

  // 3. IPC getCurrentUser dentro y fuera de un request.
  consola = admin;
  const getCu = handlerRegistry.get('getCurrentUser')!;
  const dentro = await withRequestUser(cajero, () => getCu({ sender: { id: -1 } }));
  if ((dentro as any)?.id === cajero.id) pass('getCurrentUser dentro del request = cajero');
  else fail('getCurrentUser dentro del request = cajero', `recibido id=${(dentro as any)?.id}`);
  const fuera = await getCu({ sender: { id: -1 } });
  if ((fuera as any)?.id === admin.id) pass('getCurrentUser fuera del request = consola (standalone sin cambio)');
  else fail('getCurrentUser fuera del request = consola', `recibido id=${(fuera as any)?.id}`);

  // 4. Standalone (sin request): consola admin sigue pasando.
  await expectSinRechazoDePermiso('get-gasto', [1], 'standalone, consola=admin → get-gasto pasa como antes');

  // 5. Cierre de caja (financiero update-caja): «solo quien abrió la caja puede
  //    cerrarla». Antes comparaba el abridor con la consola: un cierre por HTTP
  //    del mismo cajero se rechazaba, y uno de otro usuario pasaba si la consola
  //    era el abridor.
  const disp = await dataSource.query(`SELECT id FROM dispositivos LIMIT 1`);
  const nuevaCaja = async (abridorId: number) => {
    await dataSource.query(`INSERT INTO conteos (activo, tipo) VALUES (1, 'APERTURA')`);
    const [{ id: conteoId }] = await dataSource.query(`SELECT MAX(id) AS id FROM conteos`);
    await dataSource.query(
      `INSERT INTO cajas (fecha_apertura, dispositivo_id, conteo_apertura_id, estado, activo, created_by)
       VALUES (datetime('now'), ?, ?, 'ABIERTO', 1, ?)`, [disp[0].id, conteoId, abridorId]);
    const [{ id }] = await dataSource.query(`SELECT MAX(id) AS id FROM cajas`);
    return id as number;
  };
  const cerrar = async (cajaId: number) => {
    try {
      const r = await handlerRegistry.get('update-caja')!({ sender: { id: -1 } }, cajaId, { estado: 'CERRADO' });
      return String(r?.message || r?.error || 'ok');
    } catch (e: any) { return e?.message || String(e); }
  };
  consola = admin;
  const cajaDelCajero = await nuevaCaja(cajero.id);
  const r5a = await withRequestUser(cajero, () => cerrar(cajaDelCajero));
  if (r5a === 'ok') pass('cajero cierra por HTTP su caja con la consola en admin');
  else fail('cajero cierra por HTTP su caja con la consola en admin', r5a);
  const cajaDelCajero2 = await nuevaCaja(cajero.id);
  consola = cajero;
  const r5b = await withRequestUser(admin, () => cerrar(cajaDelCajero2));
  if (/Solo el usuario que abrió/.test(r5b)) pass('admin por HTTP no cierra la caja del cajero aunque la consola sea el cajero');
  else fail('admin por HTTP no cierra la caja del cajero aunque la consola sea el cajero', r5b);
  consola = admin;

  // 6. Guardia estática: el envoltorio sigue en registerAllAppHandlers.
  const src = fs.readFileSync(path.resolve(__dirname, '../electron/utils/register-all-handlers.ts'), 'utf8');
  if (/getEffectiveUser\(\s*rawGetCurrentUser\s*\)/.test(src)) pass('register-all-handlers envuelve getCurrentUser con getEffectiveUser');
  else fail('guardia estática', 'register-all-handlers no envuelve getCurrentUser con getEffectiveUser(rawGetCurrentUser)');

  await dataSource.destroy();
  const fallas = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fallas.length}/${results.length} OK`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
