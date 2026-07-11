/**
 * E2E del PRECIO POR VARIACIÓN (sabor × tamaño).
 *
 * Regresión del bloqueante: los precios se cotizaban por receta_id (compartida
 * entre los tamaños de un sabor) → los 3 tamaños mostraban el mismo precio.
 * Ahora el precio va por receta_presentacion_id (por tamaño). Este test ejecuta
 * el código real: crea un precio distinto para GRANDE y MEDIANA y verifica que
 * cada variación devuelve SU precio.
 *
 * Uso: npm run test:variacion-precios
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

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function seed(ds: DataSource): Promise<any> {
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');
  const { TipoPrecio } = require('../src/app/database/entities/financiero/tipo-precio.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');

  const moneda = await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({ denominacion: 'GUARANI', simbolo: 'Gs', principal: true } as any));
  const tipoPrecio = await ds.getRepository(TipoPrecio).save(ds.getRepository(TipoPrecio).create({ descripcion: 'NORMAL', activo: true } as any));
  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
  } as any));
  const grande = await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: 'GRANDE', cantidad: 3, principal: true, producto: pizza } as any));
  const mediana = await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: 'MEDIANA', cantidad: 2, principal: false, producto: pizza } as any));
  const sabor = await ds.getRepository(Sabor).save(ds.getRepository(Sabor).create({ nombre: 'CALABRESA', categoria: 'PIZZA', activo: true, producto: pizza } as any));
  const receta = await ds.getRepository(Receta).save(ds.getRepository(Receta).create({ nombre: 'PIZZA CALABRESA', activo: true, productoVariacion: pizza } as any));
  // Dos variaciones (misma receta base, distinto tamaño) — como las genera create-sabor.
  const rpGrande = await ds.getRepository(RecetaPresentacion).save(ds.getRepository(RecetaPresentacion).create({ nombre_generado: 'PIZZA GRANDE CALABRESA', receta, presentacion: grande, sabor, activo: true } as any));
  const rpMediana = await ds.getRepository(RecetaPresentacion).save(ds.getRepository(RecetaPresentacion).create({ nombre_generado: 'PIZZA MEDIANA CALABRESA', receta, presentacion: mediana, sabor, activo: true } as any));

  return { moneda, tipoPrecio, pizza, grande, mediana, sabor, receta, rpGrande, rpMediana };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-variacion-precios.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[variacion-precios] Migraciones OK.');

  const s = await seed(ds);
  registerRecetasHandlers(ds, () => null);
  registerProductosHandlers(ds, () => null);

  console.log('\n[variacion-precios] === PRECIO POR VARIACIÓN (por tamaño) ===');
  // Crear precio distinto para cada tamaño (por receta_presentacion_id).
  const pGrande: any = await invokeHandlerWithContext('create-precio-venta', undefined, {
    recetaPresentacionId: s.rpGrande.id, valor: 60000, principal: true, activo: true, monedaId: s.moneda.id, tipoPrecioId: s.tipoPrecio.id,
  });
  ok(!!pGrande?.id, 'create-precio-venta GRANDE (recetaPresentacionId) ok', pGrande);
  const pMediana: any = await invokeHandlerWithContext('create-precio-venta', undefined, {
    recetaPresentacionId: s.rpMediana.id, valor: 45000, principal: true, activo: true, monedaId: s.moneda.id, tipoPrecioId: s.tipoPrecio.id,
  });
  ok(!!pMediana?.id, 'create-precio-venta MEDIANA (recetaPresentacionId) ok');

  // get-variaciones-by-producto: cada variación con SU precio (distinto por tamaño).
  const variaciones: any[] = await invokeHandlerWithContext('get-variaciones-by-producto', undefined, s.pizza.id);
  const vGrande = (variaciones || []).find((v: any) => v.id === s.rpGrande.id);
  const vMediana = (variaciones || []).find((v: any) => v.id === s.rpMediana.id);
  ok(Number(vGrande?.precioPrincipal?.valor) === 60000, 'GRANDE muestra su precio (60000)', vGrande?.precioPrincipal?.valor);
  ok(Number(vMediana?.precioPrincipal?.valor) === 45000, 'MEDIANA muestra su precio (45000)', vMediana?.precioPrincipal?.valor);
  ok(Number(vGrande?.precioPrincipal?.valor) !== Number(vMediana?.precioPrincipal?.valor), 'los precios por tamaño son DISTINTOS (bug resuelto)');

  // get-variaciones-by-producto-and-presentacion (ruta del PdV): precio por tamaño.
  const pdvGrande: any[] = await invokeHandlerWithContext('get-variaciones-by-producto-and-presentacion', undefined, s.pizza.id, s.grande.id);
  ok(pdvGrande?.length === 1 && Number(pdvGrande[0]?.preciosVenta?.[0]?.valor) === 60000, 'PdV: GRANDE cotiza 60000', pdvGrande?.[0]?.preciosVenta?.[0]?.valor);
  const pdvMediana: any[] = await invokeHandlerWithContext('get-variaciones-by-producto-and-presentacion', undefined, s.pizza.id, s.mediana.id);
  ok(pdvMediana?.length === 1 && Number(pdvMediana[0]?.preciosVenta?.[0]?.valor) === 45000, 'PdV: MEDIANA cotiza 45000', pdvMediana?.[0]?.preciosVenta?.[0]?.valor);

  await ds.destroy();
  console.log(`\n[variacion-precios] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[variacion-precios] FATAL:', e); process.exit(1); });
