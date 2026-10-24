import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
// IMPORTANT: no importar Electron — esto es Node puro
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { handlerRegistry } from '../electron/utils/handler-registry';

// Mock de electron.ipcMain — necesario porque los handlers lo importan al
// register. Como no estamos en Electron, lo monkey-patchamos antes que se
// carguen los handler files.

// Despues del mock — ahora si podemos importar handlers sin que crashee al
// hacer ipcMain.handle()
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerSpecialRoutes } from '../electron/server/special-routes';
import { registerAuthRoutes } from '../electron/server/auth-routes';
import { registerRpcRoute } from '../electron/server/rpc-router';
import { registerFileRoutes } from '../electron/server/file-routes';
import { registerAllAppHandlers } from '../electron/utils/register-all-handlers';


import fastifyStatic from '@fastify/static';
import { seedPermissions } from '../electron/handlers/permissions.handler';
import { seedInitialData } from '../electron/utils/seed-data';
import { seedSystemData } from '../electron/utils/seed-system';

/**
 * Sandbox de pruebas de UI (sin Electron): base SQLite temporal con datos de
 * prueba + todos los handlers + /api/rpc + el desktop servido como web en /admin/.
 * Requiere antes: `npx ng build --configuration web` (dist/frc-gourmet-web).
 * Uso: npx ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/ui-sandbox.ts [puerto]
 * Usuarios: admin/admin (todos los permisos) y david/david (rol admin, segundo aprobador).
 * NUNCA apuntar a una base real: siempre recrea .tmp/ui-sandbox.db.
 */
async function main() {
  const port = Number(process.argv[2] || 7071);
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'ui-sandbox.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const dataSource = new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await dataSource.initialize();
  await dataSource.runMigrations({ transaction: 'each' });
  await seedPermissions(dataSource);
  await seedInitialData(dataSource);
  await seedSystemData(dataSource);

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Role } = E('personas/role.entity');
  const { Persona } = E('personas/persona.entity');
  const { Cargo } = E('rrhh/cargo.entity');
  const { Funcionario } = E('rrhh/funcionario.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { hashPassword } = require('../electron/utils/password.utils');
  const save = (cls: any, data: any) => dataSource.getRepository(cls).save(dataSource.getRepository(cls).create(data));

  const uRepo = dataSource.getRepository(Usuario);
  let admin: any = await uRepo.findOne({ where: { nickname: 'ADMIN' } }) || await uRepo.findOne({ where: { nickname: 'admin' } });
  if (admin) { admin.password = await hashPassword('admin'); admin.mustChangePassword = false; await uRepo.save(admin); }
  const rolAdmin: any = (await dataSource.getRepository(UsuarioRole).findOne({ where: { usuario: { id: admin?.id } }, relations: ['role'] }))?.role
    || await dataSource.getRepository(Role).findOne({ where: {} });
  const david: any = await save(Usuario, { nickname: 'DAVID', password: await hashPassword('david'), activo: true, mustChangePassword: false });
  if (rolAdmin) await save(UsuarioRole, { usuario: david, role: rolAdmin });

  const pyg: any = await dataSource.getRepository(Moneda).findOne({ where: { principal: true } }) || await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true });
  const cargo: any = await save(Cargo, { nombre: 'COCINERO (PRUEBA)', activo: true });
  for (const nombre of ['ANA', 'BETO', 'CARLA', 'DIEGO', 'EMA']) {
    const persona: any = await save(Persona, { nombre, apellido: 'PRUEBA', activo: true });
    await save(Funcionario, { persona, cargo, fechaIngreso: '2024-01-01', salarioBase: 3000000, monedaSalario: pyg, activo: true, ipsActivo: false, esJornalero: false });
  }

  let currentUser: any = admin;
  registerAllAppHandlers({ dataSource, getCurrentUser: () => currentUser, setCurrentUser: (u: any) => { currentUser = u; } });

  const fastify = Fastify({ logger: { level: 'warn' } });
  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(rateLimit, { max: 5000, timeWindow: '1 minute' });
  const { registerAuthPlugin } = require('../electron/server/auth-middleware');
  await registerAuthPlugin(fastify);
  registerSpecialRoutes(fastify, { appVersion: '0.0.0-sandbox', schemaVersion: 'sandbox', driver: 'sqlite' });
  registerAuthRoutes(fastify, dataSource);
  registerRpcRoute(fastify, dataSource);
  registerFileRoutes(fastify, dataSource);
  const adminRoot = path.resolve(__dirname, '../dist/frc-gourmet-web');
  if (fs.existsSync(adminRoot)) {
    await fastify.register(fastifyStatic, { root: adminRoot, prefix: '/admin/' });
    fastify.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/admin')) return reply.type('text/html').send(fs.readFileSync(path.join(adminRoot, 'index.html')));
      return reply.code(404).send({ error: 'not found' });
    });
  }
  await fastify.listen({ port, host: '127.0.0.1' });
  console.log(`[ui-sandbox] listo en http://127.0.0.1:${port}/admin/ (base ${dbFile})`);
}

main().catch((e) => { console.error('[ui-sandbox] FATAL:', e); process.exit(1); });
