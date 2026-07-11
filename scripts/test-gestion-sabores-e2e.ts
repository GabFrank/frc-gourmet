/**
 * E2E del listado GLOBAL de sabores (módulo "Gestión de Sabores").
 *
 * Ejercita el handler real `get-all-sabores` (con filtros) y usa el `create-sabor`
 * real para sembrar (que genera las variaciones). Verifica que la lista traiga
 * los sabores con su producto, el conteo de variaciones, y que los filtros
 * (producto, categoría, estado, texto) funcionen.
 *
 * Uso: npm run test:gestion-sabores
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerRecetasHandlers } from '../electron/handlers/recetas.handler';

let passed = 0;
let failed = 0;
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

  // Admin con permiso SABORES_GESTIONAR (create-sabor lo exige).
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'SABORES_GESTIONAR', descripcion: 'Sabores', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
  } as any));
  await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: 'GRANDE', cantidad: 3, principal: true, producto: pizza } as any));
  await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: 'MEDIANA', cantidad: 2, principal: false, producto: pizza } as any));

  const hamburguesa = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'HAMBURGUESA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
  } as any));
  await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: 'SIMPLE', cantidad: 1, principal: true, producto: hamburguesa } as any));

  return { pizza, hamburguesa, admin };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-gestion-sabores.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[gestion-sabores] Migraciones OK.');

  const s = await seed(ds);
  registerRecetasHandlers(ds, () => s.admin);

  // Sembrar sabores con el create-sabor REAL (genera variaciones).
  await invokeHandlerWithContext('create-sabor', undefined, { nombre: 'calabresa', categoria: 'pizza', productoId: s.pizza.id });
  await invokeHandlerWithContext('create-sabor', undefined, { nombre: 'peperoni', categoria: 'pizza', productoId: s.pizza.id });
  await invokeHandlerWithContext('create-sabor', undefined, { nombre: 'clasica', categoria: 'hamburguesa', productoId: s.hamburguesa.id });

  console.log('\n[gestion-sabores] === LISTA GLOBAL + FILTROS ===');
  // Sin filtros: 3 sabores, con producto y conteo de variaciones.
  const todos: any[] = await invokeHandlerWithContext('get-all-sabores', undefined, {});
  ok(Array.isArray(todos) && todos.length === 3, 'get-all-sabores devuelve 3 sabores', todos?.length);
  const cal = todos.find((x: any) => x.nombre === 'CALABRESA');
  ok(cal?.producto?.nombre === 'PIZZA', 'cada sabor trae su producto', cal?.producto);
  ok(cal?.variacionesCount === 2, 'CALABRESA: conteo de variaciones = 2 (2 tamaños)', cal?.variacionesCount);
  const clasica = todos.find((x: any) => x.nombre === 'CLASICA');
  ok(clasica?.variacionesCount === 1, 'CLASICA: conteo de variaciones = 1', clasica?.variacionesCount);

  // Filtro por texto.
  const porTexto: any[] = await invokeHandlerWithContext('get-all-sabores', undefined, { texto: 'cala' });
  ok(porTexto.length === 1 && porTexto[0].nombre === 'CALABRESA', 'filtro texto "cala" → CALABRESA', porTexto.map((x: any) => x.nombre));

  // Filtro por categoría.
  const porCat: any[] = await invokeHandlerWithContext('get-all-sabores', undefined, { categoria: 'PIZZA' });
  ok(porCat.length === 2, 'filtro categoría PIZZA → 2', porCat.length);

  // Filtro por producto.
  const porProd: any[] = await invokeHandlerWithContext('get-all-sabores', undefined, { productoId: s.hamburguesa.id });
  ok(porProd.length === 1 && porProd[0].nombre === 'CLASICA', 'filtro por producto → CLASICA', porProd.map((x: any) => x.nombre));

  // Filtro por estado (inactivos): ninguno.
  const inactivos: any[] = await invokeHandlerWithContext('get-all-sabores', undefined, { activo: false });
  ok(inactivos.length === 0, 'filtro estado inactivo → 0 (todos activos)', inactivos.length);

  await ds.destroy();
  console.log(`\n[gestion-sabores] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[gestion-sabores] FATAL:', e); process.exit(1); });
