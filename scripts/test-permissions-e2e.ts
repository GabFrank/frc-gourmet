/**
 * E2E test del sweep P0-1: verifica que el helper `ensurePermission` rebota
 * a usuarios sin el permiso requerido, y que admin (con todos los permisos)
 * pasa.
 *
 * Reusa la infra del smoke-server: BD SQLite tmp + handler-registry mockeado +
 * registerAllAppHandlers. NO arranca Electron ni Fastify — corre los handlers
 * directamente desde Node.
 *
 * Uso:
 *   npx ts-node --project tsconfig.typeorm.json scripts/test-permissions-e2e.ts
 *
 * Exit code 0 si todo OK, 1 si algun test fallo.
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { handlerRegistry } from '../electron/utils/handler-registry';

// Mock de electron antes de cargar cualquier handler.
const mockIpcMain = {
  handle: (channel: string, fn: any) => { handlerRegistry.set(channel, fn); },
  handleOnce: (channel: string, fn: any) => { handlerRegistry.set(channel, fn); },
  removeHandler: (channel: string) => { handlerRegistry.delete(channel); },
};
require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: 'electron',
  loaded: true,
  exports: {
    ipcMain: mockIpcMain,
    app: {
      getPath: () => path.resolve(__dirname, '../.tmp'),
      isReady: () => true,
      relaunch: () => {},
      exit: () => {},
      on: () => {},
      getVersion: () => '0.0.0-test',
    },
    BrowserWindow: class { static getAllWindows() { return []; } },
    dialog: {},
    shell: {},
    protocol: { registerSchemesAsPrivileged: () => {}, registerFileProtocol: () => {}, registerStringProtocol: () => {} },
    nativeImage: { createFromPath: () => ({}) },
    Menu: { buildFromTemplate: () => ({}), setApplicationMenu: () => {} },
  },
} as any;

import { getDataSourceOptions } from '../src/app/database/database.config';
import { Usuario } from '../src/app/database/entities/personas/usuario.entity';
import { Persona } from '../src/app/database/entities/personas/persona.entity';
import { Role } from '../src/app/database/entities/personas/role.entity';
import { UsuarioRole } from '../src/app/database/entities/personas/usuario-role.entity';
import { RolePermission } from '../src/app/database/entities/personas/role-permission.entity';
import { Permission } from '../src/app/database/entities/personas/permission.entity';
import { hashPassword } from '../electron/utils/password.utils';
import { checkPermission, clearPermissionCache } from '../electron/utils/auth.utils';
import { registerAllAppHandlers } from '../electron/utils/register-all-handlers';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { seedSystemData } from '../electron/utils/seed-system';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { registerAuthRoutes } from '../electron/server/auth-routes';
import { registerRpcRoute } from '../electron/server/rpc-router';

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

async function asserPermissionOk(
  dataSource: DataSource,
  user: Usuario,
  permiso: string,
  name: string,
) {
  clearPermissionCache(user.id);
  const r = await checkPermission(dataSource, () => user, permiso);
  if (r.ok) pass(name);
  else fail(name, `Esperado ok=true, recibido ${JSON.stringify(r)}`);
}

async function asserPermissionDenied(
  dataSource: DataSource,
  user: Usuario,
  permiso: string,
  name: string,
) {
  clearPermissionCache(user.id);
  const r = await checkPermission(dataSource, () => user, permiso);
  if (!r.ok && r.code === 'FORBIDDEN') pass(name);
  else fail(name, `Esperado ok=false (FORBIDDEN), recibido ${JSON.stringify(r)}`);
}

async function assertHandlerThrows(
  channel: string,
  args: any[],
  expectedMsgFragment: string,
  name: string,
) {
  const fn = handlerRegistry.get(channel);
  if (!fn) {
    fail(name, `Handler '${channel}' no registrado`);
    return;
  }
  try {
    const r = await fn({ sender: { id: -1 } }, ...args);
    // Algunos handlers envuelven en try/catch y retornan {success:false, message}.
    // Aceptamos ese patron tambien.
    if (r && typeof r === 'object' && r.success === false && typeof r.message === 'string' && r.message.includes(expectedMsgFragment)) {
      pass(name);
      return;
    }
    fail(name, `Esperado throw o {success:false, message:'${expectedMsgFragment}'}, recibido: ${JSON.stringify(r)}`);
  } catch (e: any) {
    const msg = e?.message || String(e);
    if (msg.includes(expectedMsgFragment)) {
      pass(name);
    } else {
      fail(name, `Esperado error con "${expectedMsgFragment}", recibido: "${msg}"`);
    }
  }
}

async function assertHandlerOk(
  channel: string,
  args: any[],
  name: string,
) {
  const fn = handlerRegistry.get(channel);
  if (!fn) {
    fail(name, `Handler '${channel}' no registrado`);
    return;
  }
  try {
    await fn({ sender: { id: -1 } }, ...args);
    pass(name);
  } catch (e: any) {
    const msg = e?.message || String(e);
    // Si el error es de dominio (ej "no encontrado") NO es de permisos, OK.
    if (msg.includes('PERMISO REQUERIDO')) {
      fail(name, `No esperado: handler rebotó por permisos: "${msg}"`);
    } else {
      pass(`${name} (handler aceptó permiso; falló por dominio: "${msg.slice(0, 60)}...")`);
    }
  }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-permissions.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const dataSource = new DataSource({
    ...(baseOptions as any),
    database: dbFile,
    synchronize: false,
    migrationsRun: false,
  });

  console.log('[setup] Conectando a SQLite tmp...');
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('[setup] Baseline OK.');

  console.log('[setup] Seedeando permisos + admin + roles...');
  await seedPermissions(dataSource);
  await seedSystemData(dataSource);

  // Verify admin existe
  const userRepo = dataSource.getRepository(Usuario);
  const admin = await userRepo.findOne({ where: { nickname: 'admin' } });
  if (!admin) {
    console.error('[setup] FATAL: admin user no fue seedeado');
    process.exit(1);
  }
  console.log(`[setup] Admin user id=${admin.id} listo.`);

  // Crear cajero con SOLO el permiso VENTAS_PDV (rol CAJERO ya existe del seed)
  console.log('[setup] Creando cajero de prueba...');
  const personaRepo = dataSource.getRepository(Persona);
  const roleRepo = dataSource.getRepository(Role);
  const usuarioRoleRepo = dataSource.getRepository(UsuarioRole);

  const personaCajero = await personaRepo.save(personaRepo.create({
    nombre: 'CAJERO', apellido: 'PRUEBA', activo: true,
  } as any));
  const cajero = await userRepo.save(userRepo.create({
    persona: personaCajero,
    nickname: 'cajero_test',
    password: await hashPassword('cajero'),
    activo: true,
  }));
  const rolCajero = await roleRepo.findOne({ where: { descripcion: 'CAJERO' } });
  if (!rolCajero) {
    console.error('[setup] FATAL: rol CAJERO no seedeado');
    process.exit(1);
  }
  await usuarioRoleRepo.save(usuarioRoleRepo.create({ usuario: cajero, role: rolCajero }));
  console.log(`[setup] Cajero id=${cajero.id} creado con rol CAJERO.`);

  // Registrar todos los handlers contra el ipcMain mock — esto los carga
  // en handlerRegistry para que podamos invocarlos directamente.
  let currentUser: Usuario | null = admin;
  const getCurrentUser = () => currentUser;
  const setCurrentUser = (u: Usuario | null) => { currentUser = u; };
  console.log('[setup] Registrando handlers...');
  registerAllAppHandlers({ dataSource, getCurrentUser, setCurrentUser });
  console.log(`[setup] ${handlerRegistry.size} handlers registrados.\n`);

  // ===================== TESTS =====================
  console.log('\n=== Tests checkPermission directos ===\n');

  // Admin tiene todos los permisos
  await asserPermissionOk(dataSource, admin, 'RRHH_LIQUIDACION_PAGAR', 'admin → RRHH_LIQUIDACION_PAGAR');
  await asserPermissionOk(dataSource, admin, 'COMPRAS_GESTIONAR', 'admin → COMPRAS_GESTIONAR');
  await asserPermissionOk(dataSource, admin, 'SISTEMA_BACKUP', 'admin → SISTEMA_BACKUP');
  await asserPermissionOk(dataSource, admin, 'BANCOS_GESTIONAR', 'admin → BANCOS_GESTIONAR');
  await asserPermissionOk(dataSource, admin, 'USUARIOS_GESTIONAR', 'admin → USUARIOS_GESTIONAR');
  await asserPermissionOk(dataSource, admin, 'CAJA_MAYOR_OPERAR', 'admin → CAJA_MAYOR_OPERAR');

  // Cajero solo tiene VENTAS_PDV + un puñado más
  await asserPermissionOk(dataSource, cajero, 'VENTAS_PDV', 'cajero → VENTAS_PDV (debe pasar)');
  await asserPermissionDenied(dataSource, cajero, 'RRHH_LIQUIDACION_PAGAR', 'cajero ✗ RRHH_LIQUIDACION_PAGAR');
  await asserPermissionDenied(dataSource, cajero, 'COMPRAS_GESTIONAR', 'cajero ✗ COMPRAS_GESTIONAR');
  await asserPermissionDenied(dataSource, cajero, 'SISTEMA_BACKUP', 'cajero ✗ SISTEMA_BACKUP');
  await asserPermissionDenied(dataSource, cajero, 'BANCOS_GESTIONAR', 'cajero ✗ BANCOS_GESTIONAR');
  await asserPermissionDenied(dataSource, cajero, 'USUARIOS_GESTIONAR', 'cajero ✗ USUARIOS_GESTIONAR');
  await asserPermissionDenied(dataSource, cajero, 'CAJA_MAYOR_OPERAR', 'cajero ✗ CAJA_MAYOR_OPERAR');
  await asserPermissionDenied(dataSource, cajero, 'PRODUCTOS_GESTIONAR', 'cajero ✗ PRODUCTOS_GESTIONAR');
  await asserPermissionDenied(dataSource, cajero, 'RECETAS_GESTIONAR', 'cajero ✗ RECETAS_GESTIONAR');

  console.log('\n=== Tests handlers reales (cajero invocando handlers protegidos) ===\n');

  setCurrentUser(cajero);

  // Estos handlers están en el sweep — todos deben rebotar con "PERMISO REQUERIDO"
  await assertHandlerThrows('pagar-liquidacion-sueldo', [999, {}], 'PERMISO REQUERIDO',
    'cajero ✗ pagar-liquidacion-sueldo');
  await assertHandlerThrows('anular-liquidacion-sueldo', [999, 'X'], 'PERMISO REQUERIDO',
    'cajero ✗ anular-liquidacion-sueldo');
  await assertHandlerThrows('anular-compra', [999, 'X'], 'PERMISO REQUERIDO',
    'cajero ✗ anular-compra');
  await assertHandlerThrows('backup-create', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ backup-create');
  await assertHandlerThrows('create-gasto', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-gasto');
  await assertHandlerThrows('anular-caja-mayor-movimiento', [999, 'X'], 'PERMISO REQUERIDO',
    'cajero ✗ anular-caja-mayor-movimiento');
  // cobrar-cpc-cuota: el rol CAJERO TIENE permiso CPC_COBRAR (ver seed-system.ts ROLES_PLANTILLA),
  // asi que NO debe rebotar por permiso. Lo testeamos abajo como handler que pasa autorizacion.
  await assertHandlerThrows('pagar-cpp-cuota', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ pagar-cpp-cuota');
  await assertHandlerThrows('create-cuenta-bancaria', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-cuenta-bancaria');
  await assertHandlerThrows('emitir-cheque', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ emitir-cheque');
  await assertHandlerThrows('create-vale', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-vale');
  await assertHandlerThrows('create-funcionario', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-funcionario');
  await assertHandlerThrows('justificar-asistencia', [999, {}], 'PERMISO REQUERIDO',
    'cajero ✗ justificar-asistencia');
  await assertHandlerThrows('create-penalizacion', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-penalizacion');
  await assertHandlerThrows('generar-vacaciones-funcionario', [999], 'PERMISO REQUERIDO',
    'cajero ✗ generar-vacaciones-funcionario');
  await assertHandlerThrows('create-regla-comision', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-regla-comision');
  await assertHandlerThrows('delete-persona', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-persona');
  await assertHandlerThrows('delete-usuario', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-usuario');
  await assertHandlerThrows('create-producto', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-producto');
  await assertHandlerThrows('delete-receta', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-receta');
  await assertHandlerThrows('delete-sabor', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-sabor');
  await assertHandlerThrows('update-empresa', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ update-empresa');
  await assertHandlerThrows('create-dispositivo', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-dispositivo');
  await assertHandlerThrows('cerrar-caja-mayor', [999], 'PERMISO REQUERIDO',
    'cajero ✗ cerrar-caja-mayor');

  // Batch 6 — sistema
  await assertHandlerThrows('db-config-save', [{ type: 'sqlite' }], 'PERMISO REQUERIDO',
    'cajero ✗ db-config-save');
  await assertHandlerThrows('app-mode-save', [{ mode: 'standalone' }], 'PERMISO REQUERIDO',
    'cajero ✗ app-mode-save');
  await assertHandlerThrows('add-printer', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ add-printer');
  await assertHandlerThrows('update-printer', [999, {}], 'PERMISO REQUERIDO',
    'cajero ✗ update-printer');
  await assertHandlerThrows('delete-printer', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-printer');
  await assertHandlerThrows('create-feriado', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-feriado');
  await assertHandlerThrows('delete-feriado', [999], 'PERMISO REQUERIDO',
    'cajero ✗ delete-feriado');
  await assertHandlerThrows('ia-config-set', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ ia-config-set');
  await assertHandlerThrows('factura-import-process', [{ filePath: '/tmp/x' }], 'PERMISO REQUERIDO',
    'cajero ✗ factura-import-process');
  await assertHandlerThrows('create-configuracion-rrhh', [{}], 'PERMISO REQUERIDO',
    'cajero ✗ create-configuracion-rrhh');

  console.log('\n=== Tests cajero permitidos por rol (deben pasar autorización) ===\n');

  // El rol CAJERO plantilla incluye CPC_COBRAR, CLIENTES_GESTIONAR,
  // RRHH_ASISTENCIA_REGISTRAR, VENTAS_PDV. Estos handlers deben pasar
  // autorizacion (fallaran por dominio porque pasamos payloads vacios).
  await assertHandlerOk('cobrar-cpc-cuota', [{}], 'cajero → cobrar-cpc-cuota (CPC_COBRAR)');
  await assertHandlerOk('create-cliente', [{}], 'cajero → create-cliente (CLIENTES_GESTIONAR)');
  await assertHandlerOk('create-asistencia', [{}], 'cajero → create-asistencia (RRHH_ASISTENCIA_REGISTRAR)');

  console.log('\n=== Tests admin (debe pasar autorización, puede fallar por dominio) ===\n');

  setCurrentUser(admin);

  await assertHandlerOk('backup-create', [{}], 'admin → backup-create');
  await assertHandlerOk('create-gasto', [{}], 'admin → create-gasto');
  await assertHandlerOk('emitir-cheque', [{}], 'admin → emitir-cheque');
  await assertHandlerOk('create-producto', [{}], 'admin → create-producto');
  await assertHandlerOk('update-empresa', [{}], 'admin → update-empresa');

  // Batch 6 — admin pasa autorización en handlers de sistema
  await assertHandlerOk('add-printer', [{}], 'admin → add-printer');
  await assertHandlerOk('create-feriado', [{ fecha: '2026-01-01', descripcion: 'TEST' }], 'admin → create-feriado');
  await assertHandlerOk('create-configuracion-rrhh', [{ clave: 'TEST', valor: '1' }], 'admin → create-configuracion-rrhh');

  // Bootstrap mode: sin usuario logueado, db-config-save y app-mode-save permiten pasar
  setCurrentUser(null);
  await assertHandlerOk('db-config-save', [{ type: 'sqlite', path: 'default' }], 'bootstrap (sin user) → db-config-save');
  await assertHandlerOk('app-mode-save', [{ mode: 'standalone' }], 'bootstrap (sin user) → app-mode-save');
  setCurrentUser(admin); // restaurar

  // ===================== Tests HTTP (mode=server simulado) =====================
  console.log('\n=== Tests HTTP via Fastify.inject (mode=server simulado) ===\n');

  // Reset cache para que el HTTP no use entradas del test anterior.
  clearPermissionCache();

  // En mode=server real, currentUser global apunta al operador del server,
  // NO al cliente del request HTTP. Simulamos eso seteando admin como
  // currentUser global, pero las llamadas HTTP usan tokens del JWT.
  // Si el fix con AsyncLocalStorage funciona, el cajero rebota incluso
  // estando admin como global.
  setCurrentUser(admin);

  const fastify: FastifyInstance = Fastify({ logger: false });
  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  const { registerAuthPlugin } = require('../electron/server/auth-middleware');
  await registerAuthPlugin(fastify);
  registerAuthRoutes(fastify, dataSource);
  registerRpcRoute(fastify, dataSource);
  await fastify.ready();

  // Login admin via HTTP
  const loginAdmin = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { nickname: 'admin', password: 'admin' },
  });
  const adminToken = loginAdmin.statusCode === 200 ? JSON.parse(loginAdmin.body).accessToken : null;
  if (adminToken) pass('HTTP login admin (200 + accessToken)');
  else fail('HTTP login admin', `status=${loginAdmin.statusCode} body=${loginAdmin.body}`);

  // Login cajero via HTTP
  const loginCajero = await fastify.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { nickname: 'cajero_test', password: 'cajero' },
  });
  const cajeroToken = loginCajero.statusCode === 200 ? JSON.parse(loginCajero.body).accessToken : null;
  if (cajeroToken) pass('HTTP login cajero (200 + accessToken)');
  else fail('HTTP login cajero', `status=${loginCajero.statusCode} body=${loginCajero.body}`);

  async function rpcCall(token: string | null, method: string, params: any[] = []): Promise<{ status: number; body: any }> {
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/rpc',
      headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
      payload: { method, params },
    });
    let body: any;
    try { body = JSON.parse(res.body); } catch { body = res.body; }
    return { status: res.statusCode, body };
  }

  async function asserRpcDenied(token: string | null, method: string, params: any[], name: string) {
    const r = await rpcCall(token, method, params);
    if (r.status === 403 && typeof r.body?.error === 'string' && r.body.error.includes('PERMISO REQUERIDO')) {
      pass(name);
      return;
    }
    // Algunos handlers envuelven el error en {success:false, message}.
    if (r.status === 200 && r.body?.result?.success === false && typeof r.body.result.message === 'string' && r.body.result.message.includes('PERMISO REQUERIDO')) {
      pass(name);
      return;
    }
    fail(name, `Esperado 403 PERMISO REQUERIDO, recibido status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
  }

  async function asserRpcOk(token: string | null, method: string, params: any[], name: string) {
    const r = await rpcCall(token, method, params);
    if (r.status === 200) {
      // Si retorno {success:false, message:'PERMISO...'} hay falla de autorizacion.
      const inner = r.body?.result;
      if (inner && typeof inner === 'object' && inner.success === false && typeof inner.message === 'string' && inner.message.includes('PERMISO REQUERIDO')) {
        fail(name, `Esperado paso de autorizacion, pero handler rebotó: ${inner.message}`);
        return;
      }
      pass(name);
      return;
    }
    if (r.status === 500 && typeof r.body?.error === 'string' && !r.body.error.includes('PERMISO REQUERIDO')) {
      pass(`${name} (handler aceptó permiso; falló por dominio: "${r.body.error.slice(0, 60)}...")`);
      return;
    }
    fail(name, `Esperado paso de autorizacion, recibido status=${r.status} body=${JSON.stringify(r.body).slice(0, 200)}`);
  }

  // Sin token → 401
  {
    const r = await rpcCall(null, 'backup-create', [{}]);
    if (r.status === 401) pass('HTTP sin token → 401');
    else fail('HTTP sin token → 401', `recibido ${r.status}`);
  }

  // Cajero (JWT) → handlers protegidos deben rebotar con 403 o {success:false, PERMISO REQUERIDO}
  if (cajeroToken) {
    await asserRpcDenied(cajeroToken, 'pagar-liquidacion-sueldo', [999, {}], 'HTTP cajero ✗ pagar-liquidacion-sueldo');
    await asserRpcDenied(cajeroToken, 'anular-compra', [999, 'X'], 'HTTP cajero ✗ anular-compra');
    await asserRpcDenied(cajeroToken, 'backup-create', [{}], 'HTTP cajero ✗ backup-create');
    await asserRpcDenied(cajeroToken, 'create-gasto', [{}], 'HTTP cajero ✗ create-gasto');
    await asserRpcDenied(cajeroToken, 'anular-caja-mayor-movimiento', [999, 'X'], 'HTTP cajero ✗ anular-caja-mayor-movimiento');
    await asserRpcDenied(cajeroToken, 'create-cuenta-bancaria', [{}], 'HTTP cajero ✗ create-cuenta-bancaria');
    await asserRpcDenied(cajeroToken, 'emitir-cheque', [{}], 'HTTP cajero ✗ emitir-cheque');
    await asserRpcDenied(cajeroToken, 'create-vale', [{}], 'HTTP cajero ✗ create-vale');
    await asserRpcDenied(cajeroToken, 'create-funcionario', [{}], 'HTTP cajero ✗ create-funcionario');
    await asserRpcDenied(cajeroToken, 'delete-persona', [999], 'HTTP cajero ✗ delete-persona');
    await asserRpcDenied(cajeroToken, 'delete-usuario', [999], 'HTTP cajero ✗ delete-usuario');
    await asserRpcDenied(cajeroToken, 'create-producto', [{}], 'HTTP cajero ✗ create-producto');
    await asserRpcDenied(cajeroToken, 'update-empresa', [{}], 'HTTP cajero ✗ update-empresa');
  }

  // Admin (JWT) → handlers protegidos deben pasar autorizacion
  if (adminToken) {
    await asserRpcOk(adminToken, 'backup-create', [{}], 'HTTP admin → backup-create');
    await asserRpcOk(adminToken, 'create-producto', [{}], 'HTTP admin → create-producto');
    await asserRpcOk(adminToken, 'update-empresa', [{}], 'HTTP admin → update-empresa');
    await asserRpcOk(adminToken, 'create-gasto', [{}], 'HTTP admin → create-gasto');
  }

  // Cajero (JWT) → handlers PERMITIDOS por rol deben pasar autorizacion
  if (cajeroToken) {
    await asserRpcOk(cajeroToken, 'create-cliente', [{}], 'HTTP cajero → create-cliente (CLIENTES_GESTIONAR)');
    await asserRpcOk(cajeroToken, 'create-asistencia', [{}], 'HTTP cajero → create-asistencia (RRHH_ASISTENCIA_REGISTRAR)');
  }

  await fastify.close();

  // ===================== Resumen =====================
  console.log('\n=== Resumen ===');
  const total = results.length;
  const passed = results.filter((r) => r.ok).length;
  const failed = total - passed;
  console.log(`Total: ${total}  Pasaron: ${passed}  Fallaron: ${failed}\n`);

  await dataSource.destroy();

  if (failed > 0) {
    console.log('\x1b[31m✗ Hay tests fallidos\x1b[0m');
    for (const r of results.filter((x) => !x.ok)) {
      console.log(`  - ${r.name}: ${r.detail}`);
    }
    process.exit(1);
  } else {
    console.log('\x1b[32m✓ Todos los tests pasaron\x1b[0m');
    process.exit(0);
  }
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
