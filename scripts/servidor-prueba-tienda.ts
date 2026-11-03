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
 * Requiere antes: dist/frc-gourmet-web (base-href /admin/), dist/mobile (/) y dist/storefront (/tienda/). Ver docs/handoff/HANDOFF-tienda-online-F6b.md.
 * Uso: npx ts-node --transpile-only --prefer-ts-exts --project tsconfig.typeorm.json scripts/servidor-prueba-tienda.ts [puerto]
 * Usuarios: admin/admin (todos los permisos) y david/david (rol admin, segundo aprobador).
 * NUNCA apuntar a una base real: siempre recrea .tmp/ui-sandbox.db.
 */
// Semilla opcional (catálogo de prueba anonimizado, NO va al repo): VISTA_SEMILLA_DIR con semilla.json y fotos/.
const SEMILLA_DIR = process.env.VISTA_SEMILLA_DIR || path.resolve(__dirname, '../.tmp/semilla');

async function main() {
  const port = Number(process.argv[2] || 7071);
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'vista.db');
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

  // Semilla de configuración inicial (runbook de onboarding) con el catálogo de Don Franco:
  // copia local del 24/10, anonimizada (sin documentos, teléfonos, saldos ni cuentas reales).
  const semillaPath = path.join(SEMILLA_DIR, 'semilla.json');
  if (fs.existsSync(semillaPath)) {
    const semilla: Record<string, any[]> = JSON.parse(fs.readFileSync(semillaPath, 'utf8'));
    const val = (v: any) => {
      if (v === null || v === undefined) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return v.replace('T', ' ').replace(/([+-]\d{2}:\d{2}|Z)$/, '');
      return v;
    };
    await dataSource.query('PRAGMA foreign_keys = OFF');
    const resumen: string[] = [];
    for (const [tabla, filas] of Object.entries(semilla)) {
      const cols: string[] = (await dataSource.query(`PRAGMA table_info("${tabla}")`)).map((c: any) => c.name);
      if (!cols.length) { resumen.push(`${tabla}: no existe`); continue; }
      await dataSource.query(`DELETE FROM "${tabla}"`);
      let n = 0;
      for (const f of filas) {
        const cs = Object.keys(f).filter((c) => cols.includes(c));
        try {
          await dataSource.query(`INSERT INTO "${tabla}" (${cs.map((c) => `"${c}"`).join(',')}) VALUES (${cs.map(() => '?').join(',')})`, cs.map((c) => val(f[c])));
          n++;
        } catch (e: any) { if (n === 0) console.warn(`[vista] semilla ${tabla}:`, e.message); }
      }
      resumen.push(`${tabla}:${n}/${filas.length}`);
    }
    await dataSource.query(`UPDATE "cajas_mayor" SET "responsable_id" = ?`, [admin?.id]);
    await dataSource.query(`UPDATE "producto" SET "disponible_online" = 1 WHERE "activo" = 1 AND "esVendible" = 1`);
    const tc: string[] = (await dataSource.query(`PRAGMA table_info("tienda_online_config")`)).map((c: any) => c.name);
    if (tc.length) {
      const rows = await dataSource.query(`SELECT id FROM "tienda_online_config"`);
      if (!rows.length) await dataSource.query(`INSERT INTO "tienda_online_config" ("activa") VALUES (1)`);
      const set: Record<string, any> = { activa: 1, permite_pickup: 1, permite_mesa: 1, permite_delivery: 0, pago_online_activo: 0, personalizar_sabores: 1, nombre_comercio: 'Don Franco (prueba)' };
      const ks = Object.keys(set).filter((k) => tc.includes(k));
      await dataSource.query(`UPDATE "tienda_online_config" SET ${ks.map((k) => `"${k}" = ?`).join(', ')}`, ks.map((k) => set[k]));
    }
    // Fotos de prueba (semilla/fotos/p-<productoId>.jpg o s-<saborId>.jpg). Las image_url de Don Franco
    // apuntan a archivos que la vista no tiene: se limpian para no mostrar fotos rotas.
    await dataSource.query(`UPDATE "producto" SET "image_url" = NULL`);
    try { await dataSource.query(`UPDATE "sabor" SET "image_url" = NULL`); } catch {}
    const fotosDir = path.join(SEMILLA_DIR, 'fotos');
    for (const f of fs.existsSync(fotosDir) ? fs.readdirSync(fotosDir) : []) {
      const m = /^([ps])-(\d+)\.(jpe?g|png|webp)$/i.exec(f);
      if (!m) continue;
      await dataSource.query(`UPDATE "${m[1] === 'p' ? 'producto' : 'sabor'}" SET "image_url" = ? WHERE "id" = ?`, [`app://producto-images/${f}`, Number(m[2])]);
    }
    await dataSource.query('PRAGMA foreign_keys = ON');
    console.log('[vista] semilla Don Franco:', resumen.join(' '));
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
  try { require('../electron/server/public-routes').registerPublicRoutes(fastify); } catch (e) { console.warn('[vista] sin rutas públicas', e); }
  if (fs.existsSync(path.join(SEMILLA_DIR, 'fotos'))) await fastify.register(fastifyStatic, { root: path.join(SEMILLA_DIR, 'fotos'), prefix: '/pub/producto-image/', decorateReply: false, wildcard: false });
  const adminRoot = path.resolve(__dirname, '../dist/frc-gourmet-web');
  const mobileRoot = path.resolve(__dirname, '../dist/mobile');
  const sfRoot = path.resolve(__dirname, '../dist/storefront');
  if (fs.existsSync(adminRoot)) await fastify.register(fastifyStatic, { root: adminRoot, prefix: '/admin/' });
  if (fs.existsSync(sfRoot)) await fastify.register(fastifyStatic, { root: sfRoot, prefix: '/tienda/', decorateReply: false });
  if (fs.existsSync(mobileRoot)) await fastify.register(fastifyStatic, { root: mobileRoot, prefix: '/', decorateReply: false, wildcard: false });
  const html = (dir: string) => fs.readFileSync(path.join(dir, 'index.html'));
  fastify.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not found' });
    if (req.url.startsWith('/admin') && fs.existsSync(adminRoot)) return reply.type('text/html').send(html(adminRoot));
    if (req.url.startsWith('/tienda') && fs.existsSync(sfRoot)) return reply.type('text/html').send(html(sfRoot));
    if (fs.existsSync(mobileRoot)) return reply.type('text/html').send(html(mobileRoot));
    return reply.code(404).send({ error: 'not found' });
  });
  await fastify.listen({ port, host: '0.0.0.0' });
  console.log(`[vista] lista en :${port} (/admin/, /, /tienda/) (base ${dbFile})`);
}

main().catch((e) => { console.error('[ui-sandbox] FATAL:', e); process.exit(1); });
