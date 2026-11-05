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
import Fastify, { FastifyInstance } from 'fastify';
import { registerAuthPlugin } from '../electron/server/auth-middleware';
import { registerRpcRoute } from '../electron/server/rpc-router';
import { registerAuthRoutes } from '../electron/server/auth-routes';
import rateLimit from '@fastify/rate-limit';

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

  // 7. #357: /api/rpc real (Fastify) es fail-closed y no deja tocar la sesión de la consola.
  console.log('\n=== #357 /api/rpc fail-closed ===\n');
  const fastify: FastifyInstance = Fastify({ logger: false });
  await fastify.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  await registerAuthPlugin(fastify);
  registerAuthRoutes(fastify, dataSource);
  registerRpcRoute(fastify, dataSource);
  await fastify.ready();
  const firmar = (payload: any) => (fastify as any).jwt.sign(payload);
  async function rpc(token: string, method: string, params: any[] = []) {
    const res = await fastify.inject({
      method: 'POST', url: '/api/rpc',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      payload: { method, params },
    });
    let body: any;
    try { body = JSON.parse(res.body); } catch { body = res.body; }
    return { status: res.statusCode, body };
  }
  async function esperarStatus(token: string, method: string, params: any[], status: number, name: string) {
    const r = await rpc(token, method, params);
    if (r.status === status) pass(name);
    else fail(name, `Esperado ${status}, recibido ${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    return r;
  }

  consola = admin;
  const tokCajero = firmar({ id: cajero.id, nickname: cajero.nickname, device_id: null });
  const r7a = await esperarStatus(tokCajero, 'getCurrentUser', [], 200, 'HTTP token cajero activo → 200 (control)');
  if (r7a.body?.result?.id === cajero.id) pass('HTTP getCurrentUser = cajero del token, no la consola');
  else fail('HTTP getCurrentUser = cajero del token', `recibido ${JSON.stringify(r7a.body).slice(0, 200)}`);

  const r7b = await esperarStatus(firmar({ id: 987654, nickname: 'BORRADO', device_id: null }), 'getCurrentUser', [], 401,
    'HTTP token de usuario inexistente → 401 (no cae a la consola)');
  if (r7b.body?.result?.id === admin.id) fail('usuario inexistente no ve a la consola', 'el handler corrió con la consola');

  await userRepo.update({ id: cajero.id }, { activo: false } as any);
  await esperarStatus(tokCajero, 'getCurrentUser', [], 401, 'HTTP token de usuario inactivo → 401');
  await userRepo.update({ id: cajero.id }, { activo: true } as any);

  await esperarStatus(firmar({ nickname: 'SIN_ID' }), 'getCurrentUser', [], 401, 'HTTP token sin id → 401');

  await esperarStatus(tokCajero, 'logout', [1], 403, 'HTTP logout por /api/rpc → 403');
  await esperarStatus(tokCajero, 'login', [{ nickname: 'cajero_efectivo', password: 'cajero' }], 403,
    'HTTP login por /api/rpc → 403 (no reemplaza la consola)');
  await esperarStatus(tokCajero, 'restoreSession', [{ sessionId: 1, token: 'x' }], 403, 'HTTP restoreSession por /api/rpc → 403');
  if (consola && (consola as Usuario).id === admin.id) pass('la sesión de la consola sigue intacta tras logout por HTTP');
  else fail('sesión de la consola intacta', `consola=${JSON.stringify(consola)?.slice(0, 80)}`);

  // Refresh: un usuario desactivado no renueva (vuelve al login en vez de quedar con 401 en cada RPC).
  const refrescar = async (refreshToken: string) => {
    const res = await fastify.inject({ method: 'POST', url: '/api/auth/refresh', payload: { refreshToken } });
    let body: any; try { body = JSON.parse(res.body); } catch { body = res.body; }
    return { status: res.statusCode, body };
  };
  const login = await fastify.inject({ method: 'POST', url: '/api/auth/login', payload: { nickname: 'cajero_efectivo', password: 'cajero' } });
  const rt1 = login.statusCode === 200 ? JSON.parse(login.body).refreshToken : null;
  if (!rt1) fail('HTTP login cajero', `status=${login.statusCode} body=${login.body.slice(0, 200)}`);
  else {
    const ok = await refrescar(rt1);
    if (ok.status === 200 && ok.body?.refreshToken) pass('refresh de cajero activo → 200 (control)');
    else fail('refresh de cajero activo → 200', `status=${ok.status} ${JSON.stringify(ok.body).slice(0, 200)}`);
    await userRepo.update({ id: cajero.id }, { activo: false } as any);
    const r = await refrescar(ok.body?.refreshToken);
    if (r.status === 401) pass('refresh de usuario inactivo → 401');
    else fail('refresh de usuario inactivo → 401', `status=${r.status} ${JSON.stringify(r.body).slice(0, 200)}`);
    const vivos = await dataSource.query(
      'SELECT COUNT(*) AS n FROM refresh_tokens WHERE usuario_id = ? AND revoked_at IS NULL', [cajero.id]);
    if (Number(vivos[0]?.n) === 0) pass('al rechazar el refresh se revocan los tokens del inactivo');
    else fail('tokens del inactivo revocados', `quedan ${vivos[0]?.n}`);
    await userRepo.update({ id: cajero.id }, { activo: true } as any);
  }
  await fastify.close();

  await dataSource.destroy();
  const fallas = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fallas.length}/${results.length} OK`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
