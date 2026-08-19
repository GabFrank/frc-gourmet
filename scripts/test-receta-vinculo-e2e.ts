/**
 * E2E del vinculo Producto <-> Receta (tab "Recetas" del alta de producto).
 *
 * Regresion de tres bugs encadenados que hacian que "Buscar Receta" siempre
 * fallara y que "Desvincular" no desvinculara nada:
 *
 *  1. `update-receta` asignaba `productoId`, propiedad que `Receta` nunca
 *     declaro -> no-op silencioso.
 *  2. `update-producto` desvinculaba con `producto.receta = undefined`, y
 *     TypeORM no emite UPDATE para `undefined` -> `producto.receta_id` quedaba
 *     ocupado para siempre.
 *  3. El buscador filtraba por `receta.producto` (columna `receta.producto_id`,
 *     deprecada y siempre NULL) -> ofrecia recetas ya ocupadas, y asignarlas
 *     reventaba con UNIQUE constraint sobre `producto.receta_id`.
 *
 * Uso: npm run test:receta-vinculo
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerRecetasHandlers } from '../electron/handlers/recetas.handler';
import { registerProductosHandlers } from '../electron/handlers/productos.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-receta-vinculo.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[receta-vinculo] Migraciones OK.');

  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { Adicional } = require('../src/app/database/entities/productos/adicional.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');

  const admin = await ds.getRepository(Usuario).save({ nickname: 'admin', password: 'x', activo: true } as any);
  const role = await ds.getRepository(Role).save({ descripcion: 'ADMIN', activo: true } as any);
  for (const codigo of ['RECETAS_GESTIONAR', 'PRODUCTOS_GESTIONAR', 'ADICIONALES_GESTIONAR']) {
    const permission = await ds.getRepository(Permission).save({ codigo, descripcion: codigo, activo: true } as any);
    await ds.getRepository(RolePermission).save({ role, permission } as any);
  }
  await ds.getRepository(UsuarioRole).save({ usuario: admin, role } as any);

  registerRecetasHandlers(ds, () => admin);
  registerProductosHandlers(ds, () => admin);

  const prodRepo = ds.getRepository(Producto);
  const p1 = await prodRepo.save({ nombre: 'PIZZA A', tipo: 'ELABORADO_SIN_VARIACION', activo: true } as any);
  const p2 = await prodRepo.save({ nombre: 'PIZZA B', tipo: 'ELABORADO_SIN_VARIACION', activo: true } as any);

  const recetaIdDe = async (productoId: number): Promise<number | null> => {
    const rows = await ds.query(`SELECT receta_id FROM producto WHERE id = ${productoId}`);
    return rows[0]?.receta_id ?? null;
  };

  // ---------------------------------------------------------------
  console.log('\n[1] Crear receta y vincularla al producto P1');
  const receta: any = await invokeHandlerWithContext('create-receta', undefined, {
    nombre: 'SALSA POMODORO', rendimiento: 1, activo: true,
  });
  await invokeHandlerWithContext('vincular-receta-a-producto', undefined, p1.id, receta.id);
  ok(await recetaIdDe(p1.id) === receta.id, 'producto.receta_id apunta a la receta');

  // ---------------------------------------------------------------
  console.log('\n[2] Desvincular de P1 (el bug del `undefined`)');
  await invokeHandlerWithContext('desvincular-receta-de-producto', undefined, p1.id);
  ok(await recetaIdDe(p1.id) === null, 'desvincular PERSISTE el NULL en producto.receta_id');

  // ---------------------------------------------------------------
  console.log('\n[3] Reasignar la MISMA receta a otro producto (el error reportado)');
  let errorReasignacion: string | null = null;
  try {
    await invokeHandlerWithContext('vincular-receta-a-producto', undefined, p2.id, receta.id);
  } catch (e: any) {
    errorReasignacion = e?.message || String(e);
  }
  ok(errorReasignacion === null, 'reasignar a otro producto NO lanza', errorReasignacion);
  ok(await recetaIdDe(p2.id) === receta.id, 'P2 quedo vinculado a la receta');

  // ---------------------------------------------------------------
  console.log('\n[4] Vincular una receta YA ocupada -> error legible, no UNIQUE crudo');
  const p3 = await prodRepo.save({ nombre: 'PIZZA C', tipo: 'ELABORADO_SIN_VARIACION', activo: true } as any);
  let msgOcupada = '';
  try {
    await invokeHandlerWithContext('vincular-receta-a-producto', undefined, p3.id, receta.id);
  } catch (e: any) {
    msgOcupada = e?.message || '';
  }
  ok(/ya está vinculada al producto/i.test(msgOcupada), 'mensaje legible al vincular receta ocupada', msgOcupada);
  ok(!/UNIQUE constraint/i.test(msgOcupada), 'NO se filtra el error crudo del driver', msgOcupada);

  // ---------------------------------------------------------------
  console.log('\n[5] Buscador: recetas asignables');
  const libre: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'MASA MADRE', rendimiento: 1, activo: true });

  // Receta de un ADICIONAL -> no asignable
  const recetaAdicional: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'SALSA EXTRA', rendimiento: 1, activo: true });
  await ds.getRepository(Adicional).save({ nombre: 'EXTRA QUESO', precioBase: 1000, activo: true, receta: { id: recetaAdicional.id } } as any);

  // Receta de una VARIACION (sabor x tamano) -> no asignable
  const recetaVariacion: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'MUZZA GRANDE', rendimiento: 1, activo: true });
  const productoVar = await prodRepo.save({ nombre: 'PIZZA VARIACIONES', tipo: 'ELABORADO_CON_VARIACION', activo: true } as any);
  const presentacion = await ds.getRepository(Presentacion).save({ producto: { id: productoVar.id }, nombre: 'GRANDE', cantidad: 1, activo: true } as any);
  const sabor = await ds.getRepository(Sabor).save({ nombre: 'MUZZARELLA', categoria: 'PIZZA', activo: true } as any);
  await ds.getRepository(RecetaPresentacion).save({
    nombre_generado: 'MUZZA GRANDE', receta: { id: recetaVariacion.id },
    presentacion: { id: presentacion.id }, sabor: { id: sabor.id }, costoCalculado: 0, activo: true,
  } as any);

  // Receta colgada de un producto con variaciones -> no asignable
  const recetaProdVariacion: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'BASE VARIACIONES', rendimiento: 1, activo: true });
  await ds.query(`UPDATE receta SET producto_variacion_id = ${productoVar.id} WHERE id = ${recetaProdVariacion.id}`);

  const asignables: any = await invokeHandlerWithContext('get-recetas-asignables', undefined, { productoId: p3.id, activo: true, page: 0, pageSize: 50 });
  const nombres: string[] = asignables.items.map((r: any) => r.nombre);
  ok(nombres.includes('MASA MADRE'), 'receta libre SI aparece', nombres);
  ok(!nombres.includes('SALSA POMODORO'), 'receta de otro producto NO aparece', nombres);
  ok(!nombres.includes('SALSA EXTRA'), 'receta de adicional NO aparece', nombres);
  ok(!nombres.includes('MUZZA GRANDE'), 'receta de variacion NO aparece', nombres);
  ok(!nombres.includes('BASE VARIACIONES'), 'receta de producto-con-variaciones NO aparece', nombres);

  // El producto actual debe poder re-elegir SU propia receta.
  const asignablesP2: any = await invokeHandlerWithContext('get-recetas-asignables', undefined, { productoId: p2.id, activo: true, page: 0, pageSize: 50 });
  ok(asignablesP2.items.some((r: any) => r.id === receta.id), 'la receta del propio producto SI aparece para el');

  // Busqueda case-insensitive (los nombres se guardan en MAYUSCULAS).
  const buscadas: any = await invokeHandlerWithContext('get-recetas-asignables', undefined, { productoId: p3.id, search: 'masa', activo: true, page: 0, pageSize: 50 });
  ok(buscadas.items.length === 1 && buscadas.items[0].nombre === 'MASA MADRE', 'busqueda por nombre en minusculas funciona', buscadas.items.map((r: any) => r.nombre));

  // ---------------------------------------------------------------
  console.log('\n[6] `productoVinculado` virtual resuelto por producto.receta_id');
  const recetaConProducto: any = await invokeHandlerWithContext('get-receta', undefined, receta.id);
  ok(recetaConProducto.productoVinculado?.id === p2.id, 'get-receta expone productoVinculado', recetaConProducto.productoVinculado);
  const recetaLibre: any = await invokeHandlerWithContext('get-receta', undefined, libre.id);
  ok(recetaLibre.productoVinculado === null, 'receta libre -> productoVinculado null', recetaLibre.productoVinculado);

  const conFiltros: any = await invokeHandlerWithContext('get-recetas-with-filters', undefined, { page: 0, pageSize: 100 });
  const vinculadaEnLista = conFiltros.items.find((r: any) => r.id === receta.id);
  const libreEnLista = conFiltros.items.find((r: any) => r.id === libre.id);
  ok(!!vinculadaEnLista?.productoVinculado, 'get-recetas-with-filters marca la receta completa', vinculadaEnLista?.productoVinculado);
  ok(libreEnLista?.productoVinculado === null, 'get-recetas-with-filters marca la pre-receta', libreEnLista?.productoVinculado);

  // ---------------------------------------------------------------
  console.log('\n[7] `delete-receta-for-adicional` libera adicional.receta_id (bug gemelo)');
  const adicionalRows = await ds.query('SELECT id FROM adicional LIMIT 1');
  const adicionalId = adicionalRows[0].id;
  await invokeHandlerWithContext('delete-receta-for-adicional', undefined, adicionalId);
  const adicionalTrasBorrar = await ds.query(`SELECT receta_id FROM adicional WHERE id = ${adicionalId}`);
  ok(adicionalTrasBorrar[0].receta_id === null, 'adicional.receta_id queda en NULL', adicionalTrasBorrar[0]);

  // ---------------------------------------------------------------
  console.log('\n[8] No-regresion: la FK deprecada receta.producto_id sigue sin escribirse');
  await invokeHandlerWithContext('update-receta', undefined, receta.id, {
    nombre: 'SALSA POMODORO', descripcion: 'X', rendimiento: 1,
    unidadRendimiento: 'UNIDADES', activo: true, productoId: p1.id,
  });
  const conProductoId = await ds.query('SELECT COUNT(*) AS c FROM receta WHERE producto_id IS NOT NULL');
  ok(Number(conProductoId[0].c) === 0, 'receta.producto_id sigue 100% NULL', conProductoId[0]);
  ok(await recetaIdDe(p2.id) === receta.id, 'update-receta no toca el vinculo real');

  // ---------------------------------------------------------------
  console.log('\n[9] Varias recetas de variacion conviven en el mismo producto');
  const r1: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'NAPOLITANA GRANDE', rendimiento: 1, activo: true });
  const r2: any = await invokeHandlerWithContext('create-receta', undefined, { nombre: 'NAPOLITANA MEDIANA', rendimiento: 1, activo: true });
  await ds.query(`UPDATE receta SET producto_variacion_id = ${productoVar.id} WHERE id IN (${r1.id}, ${r2.id})`);
  const cuantas = await ds.query(`SELECT COUNT(*) AS c FROM receta WHERE producto_variacion_id = ${productoVar.id}`);
  ok(Number(cuantas[0].c) === 3, 'N recetas por producto-con-variaciones (sin UNIQUE)', cuantas[0]);

  await ds.destroy();

  console.log(`\n[receta-vinculo] ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
