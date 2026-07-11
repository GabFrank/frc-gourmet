/**
 * E2E: cada variación (sabor × tamaño) tiene su PROPIA receta.
 *
 * Antes create-sabor creaba UNA receta y la compartía entre los tamaños del sabor,
 * por lo que editar la receta de "grande" cambiaba "mediano/chico". Ahora cada
 * variación tiene su receta propia (ingredientes/costo por tamaño).
 *
 * Uso: npm run test:receta-por-variacion
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

async function seed(ds: DataSource): Promise<any> {
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');

  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'SABORES_GESTIONAR', descripcion: 'Sabores', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
  } as any));
  for (const [n, c] of [['GRANDE', 3], ['MEDIANA', 2], ['CHICA', 1]] as any[]) {
    await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: n, cantidad: c, principal: n === 'GRANDE', producto: pizza } as any));
  }
  return { admin, pizza };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-receta-por-variacion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[receta-por-variacion] Migraciones OK.');

  const s = await seed(ds);
  registerRecetasHandlers(ds, () => s.admin);

  await invokeHandlerWithContext('create-sabor', undefined, { nombre: 'calabresa', categoria: 'pizza', productoId: s.pizza.id });

  const variaciones: any[] = await invokeHandlerWithContext('get-variaciones-by-producto', undefined, s.pizza.id);
  ok(variaciones.length === 3, 'create-sabor genera 3 variaciones (3 tamaños)', variaciones.length);

  const recetaIds = variaciones.map((v: any) => v.receta?.id);
  ok(recetaIds.every((id: any) => !!id), 'todas las variaciones tienen receta');
  const distintas = new Set(recetaIds);
  ok(distintas.size === 3, 'cada variación tiene una receta DISTINTA (no compartida)', recetaIds);

  // Editar la receta de una variación no debe tocar la de otra (recetas distintas
  // → filas distintas). Verificamos que renombrar una receta no cambia las otras.
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const primera = variaciones[0].receta.id;
  await ds.getRepository(Receta).update(primera, { descripcion: 'SOLO GRANDE' } as any);
  const recetas = await ds.getRepository(Receta).findByIds(Array.from(distintas));
  const conMarca = recetas.filter((r: any) => r.descripcion === 'SOLO GRANDE');
  ok(conMarca.length === 1, 'editar una receta afecta SOLO a su variación', conMarca.length);

  await ds.destroy();
  console.log(`\n[receta-por-variacion] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[receta-por-variacion] FATAL:', e); process.exit(1); });
