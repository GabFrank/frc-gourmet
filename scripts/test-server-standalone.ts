/**
 * Smoke test del Fastify server SIN arrancar Electron.
 *
 * Usa una BD SQLite tmp (.tmp/test-server.db), corre la baseline con
 * `dataSource.runMigrations()`, registra los handlers IPC mockeados (sin
 * ipcMain real) e instancia el server.
 *
 * Uso (desde el repo root):
 *   npx ts-node --project tsconfig.typeorm.json scripts/test-server-standalone.ts
 *
 * Despues testear endpoints con curl:
 *   curl http://localhost:7070/api/version
 *   curl http://localhost:7070/api/health
 *
 * Para que cierre, Ctrl-C o el process exit cuando termina el test.
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';
// IMPORTANT: no importar Electron — esto es Node puro
import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { handlerRegistry } from '../electron/utils/handler-registry';
import { registerSpecialRoutes } from '../electron/server/special-routes';
import { registerAuthRoutes } from '../electron/server/auth-routes';
import { registerRpcRoute } from '../electron/server/rpc-router';

// Mock de electron.ipcMain — necesario porque los handlers lo importan al
// register. Como no estamos en Electron, lo monkey-patchamos antes que se
// carguen los handler files.
const mockIpcMain = {
  handle: (channel: string, fn: any) => {
    handlerRegistry.set(channel, fn);
  },
  handleOnce: (channel: string, fn: any) => {
    handlerRegistry.set(channel, fn);
  },
  removeHandler: (channel: string) => {
    handlerRegistry.delete(channel);
  },
};
// Inyectar antes que electron sea require'd por nadie (truco de require.cache)
require.cache[require.resolve('electron')] = {
  id: 'electron',
  filename: 'electron',
  loaded: true,
  exports: { ipcMain: mockIpcMain, app: { getPath: () => path.resolve(__dirname, '../.tmp') } },
} as any;

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-server.db');
  // Empezar limpio cada vez
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const dataSource = new DataSource({
    ...(baseOptions as any),
    database: dbFile,
    synchronize: false,
    migrationsRun: false,
  });

  console.log('[test] Conectando a tmp SQLite...');
  await dataSource.initialize();
  console.log('[test] Corriendo baseline...');
  await dataSource.runMigrations({ transaction: 'each' });
  console.log('[test] Baseline OK.');

  // Crear admin user para login
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { hashPassword } = require('../electron/utils/password.utils');
  const userRepo = dataSource.getRepository(Usuario);
  const adminPwd = await hashPassword('admin');
  const admin = userRepo.create({ nickname: 'admin', password: adminPwd, activo: true });
  await userRepo.save(admin);
  console.log('[test] Admin user creado: admin / admin');

  // Sin Electron real, escribimos directo en handlerRegistry (skipeando el
  // monkey-patch de installHandlerRegistry — que requiere ipcMain real).
  handlerRegistry.set('test-echo', async (_event: any, msg: string) => {
    return { echo: msg, timestamp: Date.now() };
  });
  handlerRegistry.set('count-usuarios', async () => {
    return userRepo.count();
  });

  // Bootstrap Fastify
  const fastify = Fastify({ logger: { level: 'info' } });
  await fastify.register(cors, { origin: true, credentials: true });
  await fastify.register(rateLimit, { max: 1000, timeWindow: '1 minute' });

  const { registerAuthPlugin } = require('../electron/server/auth-middleware');
  await registerAuthPlugin(fastify);

  registerSpecialRoutes(fastify, {
    appVersion: '0.0.0-test',
    schemaVersion: 'Baseline1778378410416',
    driver: 'sqlite',
  });
  registerAuthRoutes(fastify, dataSource);
  registerRpcRoute(fastify);

  await fastify.listen({ port: 7070, host: '0.0.0.0' });
  console.log('\n[test] Server escuchando en http://localhost:7070');
  console.log('[test] Probar:');
  console.log('   curl http://localhost:7070/api/version');
  console.log('   curl http://localhost:7070/api/health');
  console.log('   curl -X POST http://localhost:7070/api/auth/login -H "Content-Type: application/json" -d \'{"nickname":"admin","password":"admin"}\'');
  console.log('   curl -H "Authorization: Bearer <token>" -X POST http://localhost:7070/api/rpc -H "Content-Type: application/json" -d \'{"method":"test-echo","params":["hola"]}\'');
  console.log('\n[test] Ctrl-C para terminar.');
}

main().catch((e) => {
  console.error('[test] FATAL:', e);
  process.exit(1);
});
