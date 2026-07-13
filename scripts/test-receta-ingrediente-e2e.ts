/**
 * E2E de contrato de create-receta-ingrediente (regresión del asistente
 * multi-variación): el handler debe aceptar un ítem "solo descripción"
 * (sin producto vinculado). El fix del frontend propaga `descripcion` al
 * agregar el mismo ingrediente a las recetas de otras variaciones del sabor.
 *
 * Uso: npm run test:receta-ingrediente
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerRecetasHandlers } from '../electron/handlers/recetas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-receta-ingrediente.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[receta-ingrediente] Migraciones OK.');

  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');

  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'INGREDIENTES_GESTIONAR', descripcion: 'Ingredientes', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  const receta = await ds.getRepository(Receta).save(ds.getRepository(Receta).create({ nombre: 'PIZZA MUZZA GRANDE', rendimiento: 1, unidadRendimiento: 'UNIDADES', costoCalculado: 0, activo: true } as any));
  const queso = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({ nombre: 'QUESO', tipo: 'RETAIL_INGREDIENTE', activo: true } as any));

  registerRecetasHandlers(ds, () => admin);

  // 1. Ingrediente vinculado a producto.
  const conProducto = await invokeHandlerWithContext('create-receta-ingrediente', undefined, {
    receta: { id: receta.id }, ingrediente: { id: queso.id }, cantidad: 200, unidad: 'GRAMOS', costoUnitario: 10, costoTotal: 2000,
  });
  ok(!!conProducto?.id, 'create-receta-ingrediente con producto vinculado OK');

  // 2. Ítem SOLO DESCRIPCIÓN (el caso que fallaba en el asistente multi-variación).
  let soloDesc: any;
  try {
    soloDesc = await invokeHandlerWithContext('create-receta-ingrediente', undefined, {
      receta: { id: receta.id }, descripcion: 'oregano', cantidad: 5, unidad: 'GRAMOS',
    });
    ok(!!soloDesc?.id, 'create-receta-ingrediente SOLO descripción NO lanza');
    ok(soloDesc?.descripcion === 'OREGANO', 'descripción guardada en MAYÚSCULAS', soloDesc?.descripcion);
  } catch (e: any) {
    ok(false, 'create-receta-ingrediente SOLO descripción NO lanza', e?.message);
  }

  // 3. Sin ingrediente NI descripción → debe lanzar.
  let lanzo = false;
  try {
    await invokeHandlerWithContext('create-receta-ingrediente', undefined, { receta: { id: receta.id }, cantidad: 1 });
  } catch (e: any) {
    lanzo = /ingrediente o una descripci/i.test(e?.message || '');
  }
  ok(lanzo, 'sin ingrediente ni descripción → lanza el error esperado');

  await ds.destroy();
  console.log(`\n[receta-ingrediente] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[receta-ingrediente] FATAL:', e); process.exit(1); });
