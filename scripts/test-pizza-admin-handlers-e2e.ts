/**
 * E2E de los handlers de ADMINISTRACIÓN de pizzas (sabores + variaciones).
 *
 * Regresión del bug: varios handlers referenciaban `Receta.sabor` / `Sabor.recetas`,
 * relaciones que ya no existen (el vínculo sabor se movió a RecetaPresentacion),
 * y lanzaban en runtime. Este test crea sabores, lista, renombra, genera y elimina
 * variaciones ejecutando el CÓDIGO REAL contra una SQLite temporal con migraciones.
 *
 * Uso: npx ts-node --project tsconfig.typeorm.json scripts/test-pizza-admin-handlers-e2e.ts
 *      (o: npm run test:pizza-admin)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerSaboresHandlers } from '../electron/handlers/sabores.handler';
import { registerRecetaPresentacionHandlers } from '../electron/handlers/receta-presentacion.handler';

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function seedPizza(ds: DataSource): Promise<any> {
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const producto = await ds.getRepository(Producto).save(
    ds.getRepository(Producto).create({
      nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
    } as any),
  );
  const grande = await ds.getRepository(Presentacion).save(
    ds.getRepository(Presentacion).create({ nombre: 'GRANDE', cantidad: 3, principal: true, producto } as any),
  );
  const mediana = await ds.getRepository(Presentacion).save(
    ds.getRepository(Presentacion).create({ nombre: 'MEDIANA', cantidad: 2, principal: false, producto } as any),
  );
  return { producto, grande, mediana };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-pizza-admin.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[pizza-admin] Migraciones OK.');

  const seeded = await seedPizza(ds);
  registerSaboresHandlers(ds, () => null);
  registerRecetaPresentacionHandlers(ds, () => null);

  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');

  console.log('\n[pizza-admin] === CREAR SABOR (auto-genera variaciones con sabor) ===');
  // 1. create-sabor CALABRESA → NO debe lanzar, y crea 2 variaciones (una por tamaño).
  let creado: any;
  try {
    creado = await invokeHandlerWithContext('create-sabor', undefined, {
      nombre: 'calabresa', categoria: 'pizza', productoId: seeded.producto.id,
    });
    ok(!!creado?.sabor?.id, 'create-sabor CALABRESA no lanza y devuelve el sabor', creado?.mensaje);
  } catch (e: any) {
    ok(false, 'create-sabor CALABRESA no lanza', e?.message);
  }
  const bacon: any = await invokeHandlerWithContext('create-sabor', undefined, {
    nombre: 'bacon', categoria: 'pizza', productoId: seeded.producto.id,
  });
  ok(!!bacon?.sabor?.id, 'create-sabor BACON no lanza');

  // Verificar en DB: 2 sabores × 2 presentaciones = 4 RecetaPresentacion, todas con sabor NOT NULL.
  const rps = await ds.getRepository(RecetaPresentacion).find({ relations: ['sabor', 'presentacion', 'receta'] });
  ok(rps.length === 4, 'se generaron 4 variaciones (2 sabores × 2 tamaños)', rps.length);
  ok(rps.every((rp: any) => rp.sabor?.id), 'todas las variaciones tienen sabor asignado (NOT NULL)');
  ok(rps.every((rp: any) => rp.receta?.id && rp.presentacion?.id), 'todas las variaciones tienen receta y presentación');

  console.log('\n[pizza-admin] === LISTAR SABORES + VARIACIONES ===');
  // 2. get-sabores-by-producto → NO lanza, devuelve 2 sabores con recetas adjuntas.
  let sabores: any;
  try {
    sabores = await invokeHandlerWithContext('get-sabores-by-producto', undefined, seeded.producto.id);
    ok(Array.isArray(sabores) && sabores.length === 2, 'get-sabores-by-producto no lanza y devuelve 2 sabores', sabores?.length);
  } catch (e: any) {
    ok(false, 'get-sabores-by-producto no lanza', e?.message);
  }
  ok((sabores || []).every((s: any) => Array.isArray(s.recetas) && s.recetas.length === 1),
    'cada sabor trae su receta base adjunta');

  // 3. get-variaciones-by-producto → NO lanza, devuelve 4.
  let vars: any;
  try {
    vars = await invokeHandlerWithContext('get-variaciones-by-producto', undefined, seeded.producto.id);
    ok(Array.isArray(vars) && vars.length === 4, 'get-variaciones-by-producto no lanza y devuelve 4', vars?.length);
  } catch (e: any) {
    ok(false, 'get-variaciones-by-producto no lanza', e?.message);
  }

  // 4. get-variaciones-by-producto-and-presentacion (ruta del PdV) → 2 (una por sabor) para GRANDE.
  const varsGrande: any = await invokeHandlerWithContext('get-variaciones-by-producto-and-presentacion', undefined, seeded.producto.id, seeded.grande.id);
  ok(Array.isArray(varsGrande) && varsGrande.length === 2, 'PdV: variaciones por producto+presentación (GRANDE) = 2', varsGrande?.length);
  ok(varsGrande.every((v: any) => v.sabor?.nombre), 'PdV: cada variación trae su sabor');

  console.log('\n[pizza-admin] === RENOMBRAR SABOR ===');
  // 5. update-sabor rename CALABRESA → CALABRESA ESPECIAL: NO lanza y renombra receta + variaciones.
  const calabresaId = creado.sabor.id;
  try {
    await invokeHandlerWithContext('update-sabor', undefined, calabresaId, { nombre: 'calabresa especial' });
    ok(true, 'update-sabor (rename) no lanza');
  } catch (e: any) {
    ok(false, 'update-sabor (rename) no lanza', e?.message);
  }
  const rpsCal = await ds.getRepository(RecetaPresentacion).find({ relations: ['sabor', 'receta'] });
  const deCalabresa = rpsCal.filter((rp: any) => rp.sabor?.id === calabresaId);
  ok(deCalabresa.length === 2 && deCalabresa.every((rp: any) => rp.nombre_generado.includes('CALABRESA ESPECIAL')),
    'las variaciones del sabor se renombraron', deCalabresa.map((r: any) => r.nombre_generado));
  ok(deCalabresa.every((rp: any) => (rp.receta?.nombre || '').includes('CALABRESA ESPECIAL')),
    'la receta base se renombró');

  console.log('\n[pizza-admin] === ELIMINAR + REGENERAR VARIACIÓN ===');
  // 6. delete-receta-presentacion → NO lanza.
  const unaVarGrandeCal: any = deCalabresa.find((rp: any) => rp.presentacion?.id === seeded.grande.id)
    || (await ds.getRepository(RecetaPresentacion).find({ where: { sabor: { id: calabresaId }, presentacion: { id: seeded.grande.id } } }))[0];
  try {
    const del = await invokeHandlerWithContext('delete-receta-presentacion', undefined, unaVarGrandeCal.id);
    ok(del?.success === true, 'delete-receta-presentacion no lanza y elimina');
  } catch (e: any) {
    ok(false, 'delete-receta-presentacion no lanza', e?.message);
  }
  const trasDelete = await ds.getRepository(RecetaPresentacion).count();
  ok(trasDelete === 3, 'quedan 3 variaciones tras eliminar 1', trasDelete);

  // 7. generate-variaciones-faltantes → regenera la faltante (infiere sabor de las existentes).
  let regen: any;
  try {
    regen = await invokeHandlerWithContext('generate-variaciones-faltantes', undefined, seeded.producto.id);
    ok(regen?.success === true && regen?.variacionesGeneradas === 1, 'generate-variaciones-faltantes regenera la faltante', regen);
  } catch (e: any) {
    ok(false, 'generate-variaciones-faltantes no lanza', e?.message);
  }
  const trasRegen = await ds.getRepository(RecetaPresentacion).find({ relations: ['sabor'] });
  ok(trasRegen.length === 4 && trasRegen.every((rp: any) => rp.sabor?.id),
    'vuelven a ser 4 variaciones, todas con sabor', trasRegen.length);

  await ds.destroy();
  console.log(`\n[pizza-admin] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[pizza-admin] FATAL:', e); process.exit(1); });
