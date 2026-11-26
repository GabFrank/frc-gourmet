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
import { registerPublicRoutes, registerPublicOperation } from '../electron/server/public-routes';
import { getRequestUser, ensurePermission } from '../electron/utils/auth.utils';
import { setEntityUserTracking } from '../electron/utils/entity.utils';
import {
  getUsuarioSistemaOnline, resetUsuarioSistemaOnlineCache, NICKNAME_SISTEMA_ONLINE,
} from '../electron/utils/usuario-sistema.utils';

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

  // 8. #357 punto 3: /api/pub corre a nombre de «Sistema / Online», no de la consola.
  console.log('\n=== #357.3 rutas públicas a nombre de Sistema / Online ===\n');
  consola = admin;
  handlerRegistry.set('test-pub-quien', async () => {
    const p = dataSource.getRepository(Persona).create({ nombre: 'CREADA POR PUB' } as any);
    await setEntityUserTracking(dataSource, p, (consola as Usuario)?.id, false);
    const guardada: any = await dataSource.getRepository(Persona).save(p);
    return { requestUserId: getRequestUser()?.id ?? null, createdById: guardada.createdBy?.id ?? null };
  });
  handlerRegistry.set('test-pub-permiso', async () => {
    try {
      await ensurePermission(dataSource, () => consola, 'VENTAS_PDV');
      return 'paso';
    } catch (e: any) {
      return `rechazo: ${e?.message}`;
    }
  });
  registerPublicOperation('test.quien', { channel: 'test-pub-quien', requiresAuth: false });
  registerPublicOperation('test.permiso', { channel: 'test-pub-permiso', requiresAuth: false });
  resetUsuarioSistemaOnlineCache();
  const pubFastify: FastifyInstance = Fastify({ logger: false });
  await pubFastify.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  await registerAuthPlugin(pubFastify);
  registerAuthRoutes(pubFastify, dataSource);
  registerRpcRoute(pubFastify, dataSource);
  registerPublicRoutes(pubFastify, dataSource);
  await pubFastify.ready();
  const pub = async (op: string, params: any[] = []) => {
    const res = await pubFastify.inject({ method: 'POST', url: '/pub/rpc', payload: { op, params } });
    let body: any; try { body = JSON.parse(res.body); } catch { body = res.body; }
    return { status: res.statusCode, body };
  };

  // Dos requests a la vez la primera vez: se crea un solo usuario.
  const [q1, q2] = await Promise.all([pub('test.quien'), pub('test.quien')]);
  const sistemas = await userRepo.find({ where: { nickname: NICKNAME_SISTEMA_ONLINE } });
  if (sistemas.length === 1) pass('se crea un solo usuario Sistema / Online (requests concurrentes)');
  else fail('un solo usuario Sistema / Online', `hay ${sistemas.length}`);
  const sistema = sistemas[0];
  if (sistema && sistema.activo === false) pass('Sistema / Online queda inactivo');
  else fail('Sistema / Online inactivo', `activo=${sistema?.activo}`);
  const rolesSistema = sistema ? await dataSource.getRepository(UsuarioRole).count({ where: { usuario: { id: sistema.id } } }) : -1;
  if (rolesSistema === 0) pass('Sistema / Online no tiene roles');
  else fail('Sistema / Online sin roles', `roles=${rolesSistema}`);
  for (const [i, q] of [q1, q2].entries()) {
    if (q.status === 200 && q.body?.result?.requestUserId === sistema?.id && q.body?.result?.createdById === sistema?.id) {
      pass(`pub #${i + 1}: el handler ve a Sistema / Online y la autoría queda a su nombre`);
    } else {
      fail(`pub #${i + 1} a nombre de Sistema / Online`, `status=${q.status} ${JSON.stringify(q.body).slice(0, 200)} sistema=${sistema?.id} consola=${admin.id}`);
    }
  }

  const qp = await pub('test.permiso');
  if (qp.status === 200 && /^rechazo: PERMISO REQUERIDO/.test(String(qp.body?.result))) pass('pub no hereda los permisos de la consola (ensurePermission falla)');
  else fail('pub sin permisos de la consola', `status=${qp.status} ${JSON.stringify(qp.body).slice(0, 200)}`);

  const qc = await pub('tienda.config');
  if (qc.status === 200 && qc.body?.result !== undefined) pass('operación pública real (tienda.config) sigue andando → 200');
  else fail('tienda.config → 200', `status=${qc.status} ${JSON.stringify(qc.body).slice(0, 200)}`);

  // Reinicio (cache vacío): reusa el mismo usuario.
  resetUsuarioSistemaOnlineCache();
  const otra = await getUsuarioSistemaOnline(dataSource);
  if (otra.id === sistema?.id && (await userRepo.count({ where: { nickname: NICKNAME_SISTEMA_ONLINE } })) === 1) {
    pass('tras reiniciar reusa el mismo usuario (idempotente)');
  } else fail('reusa el mismo usuario', `id=${otra.id} vs ${sistema?.id}`);

  // No puede iniciar sesión ni usar /api/rpc.
  // Con una clave conocida igual rechaza: por inactivo, no por la clave.
  await userRepo.update({ id: sistema!.id }, { password: await hashPassword('conocida') } as any);
  const loginSis = await pubFastify.inject({ method: 'POST', url: '/api/auth/login', payload: { nickname: NICKNAME_SISTEMA_ONLINE, password: 'conocida' } });
  if (loginSis.statusCode >= 400 && /inactivo/.test(loginSis.body)) pass('Sistema / Online no puede iniciar sesión (inactivo)');
  else fail('Sistema / Online sin login', `status=${loginSis.statusCode} ${loginSis.body.slice(0, 120)}`);

  // Si alguien lo activa y le da un rol, al resolverlo se vuelve a sanear.
  const rolAdmin = await dataSource.getRepository(Role).findOne({ where: {} as any, order: { id: 'ASC' } as any });
  await userRepo.update({ id: sistema!.id }, { activo: true } as any);
  if (rolAdmin) await dataSource.getRepository(UsuarioRole).save({ usuario: { id: sistema!.id }, role: rolAdmin } as any);
  resetUsuarioSistemaOnlineCache();
  await getUsuarioSistemaOnline(dataSource);
  const saneado = await userRepo.findOne({ where: { id: sistema!.id } });
  const rolesTras = await dataSource.getRepository(UsuarioRole).count({ where: { usuario: { id: sistema!.id } } });
  if (rolAdmin && saneado?.activo === false && rolesTras === 0) pass('si lo activan y le dan un rol, vuelve a inactivo y sin roles');
  else fail('saneo de Sistema / Online', `rol=${!!rolAdmin} activo=${saneado?.activo} roles=${rolesTras}`);
  const tokSis = (pubFastify as any).jwt.sign({ id: sistema?.id, nickname: NICKNAME_SISTEMA_ONLINE, device_id: null });
  const rpcSis = await pubFastify.inject({
    method: 'POST', url: '/api/rpc', headers: { authorization: `Bearer ${tokSis}` }, payload: { method: 'getCurrentUser', params: [] },
  });
  if (rpcSis.statusCode === 401) pass('token de Sistema / Online en /api/rpc → 401');
  else fail('Sistema / Online en /api/rpc → 401', `status=${rpcSis.statusCode}`);
  // Aviso de un proveedor de pago (webhook): también a nombre de Sistema / Online.
  handlerRegistry.set('pub-pago-aviso', async () => {
    const p = dataSource.getRepository(Persona).create({ nombre: 'CREADA POR AVISO' } as any);
    await setEntityUserTracking(dataSource, p, (consola as Usuario)?.id, false);
    const guardada: any = await dataSource.getRepository(Persona).save(p);
    return { http: 200, respuesta: { requestUserId: getRequestUser()?.id ?? null, createdById: guardada.createdBy?.id ?? null } };
  });
  const aviso = await pubFastify.inject({ method: 'POST', url: '/pub/pagos/BANCARD/aviso', payload: { x: 1 } });
  let avisoBody: any; try { avisoBody = JSON.parse(aviso.body); } catch { avisoBody = aviso.body; }
  if (aviso.statusCode === 200 && avisoBody?.requestUserId === sistema?.id && avisoBody?.createdById === sistema?.id) {
    pass('aviso de pago (/pub/pagos/:proveedor/aviso) corre a nombre de Sistema / Online');
  } else fail('aviso de pago a nombre de Sistema / Online', `status=${aviso.statusCode} ${aviso.body.slice(0, 200)} sistema=${sistema?.id}`);

  // Job de pagos: a nombre de Sistema / Online, y si no se puede resolver, se saltea (fail-closed).
  const { cicloJobPagosOnline } = await import('../electron/services/pagos-online/pagos-online.service');
  let usadoPorJob: number | null = null;
  const corrio = await cicloJobPagosOnline(dataSource, async () => undefined, async (ds) => {
    const u = await getUsuarioSistemaOnline(ds);
    usadoPorJob = u.id;
    return u;
  });
  if (corrio && usadoPorJob === sistema?.id) pass('ciclo del job de pagos corre con Sistema / Online');
  else fail('ciclo del job con Sistema / Online', `corrio=${corrio} usuario=${usadoPorJob} sistema=${sistema?.id}`);
  let tickCorrio = false;
  const salteado = await cicloJobPagosOnline(dataSource, async () => { tickCorrio = true; }, async () => { throw new Error('sin usuario'); });
  if (salteado === false && !tickCorrio) pass('sin usuario Sistema / Online el job se saltea el ciclo (fail-closed)');
  else fail('job fail-closed', `salteado=${salteado} tickCorrio=${tickCorrio}`);

  if (consola && (consola as Usuario).id === admin.id) pass('la consola sigue con su usuario tras las rutas públicas');
  else fail('consola intacta tras pub', `consola=${JSON.stringify(consola)?.slice(0, 80)}`);
  await pubFastify.close();

  await dataSource.destroy();
  const fallas = results.filter((r) => !r.ok);
  console.log(`\n${results.length - fallas.length}/${results.length} OK`);
  process.exit(fallas.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
