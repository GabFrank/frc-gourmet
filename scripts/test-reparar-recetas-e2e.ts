/**
 * E2E de la reparación "des-compartir recetas" (Fase B de receta-por-variación).
 *
 * Siembra el modelo VIEJO: 3 variaciones (grande/mediana/chica) compartiendo UNA
 * receta con todo su grafo (ingredientes + intercambiable + fase + fase-ingrediente
 * + material + adicional vinculado). Corre desduplicarRecetasCompartidas y verifica
 * que cada variación quede con su propia receta CLONADA (con todos los hijos) y que
 * editar una no afecte a la otra. Idempotente.
 *
 * Uso: npm run test:reparar-recetas
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { desduplicarRecetasCompartidas } from '../electron/utils/receta-clone.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-reparar-recetas.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[reparar-recetas] Migraciones OK.');

  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');
  const { RecetaIngrediente } = require('../src/app/database/entities/productos/receta-ingrediente.entity');
  const { RecetaIngredienteIntercambiable } = require('../src/app/database/entities/productos/receta-ingrediente-intercambiable.entity');
  const { RecetaFase } = require('../src/app/database/entities/productos/receta-fase.entity');
  const { RecetaFaseIngrediente } = require('../src/app/database/entities/productos/receta-fase-ingrediente.entity');
  const { RecetaMaterial } = require('../src/app/database/entities/productos/receta-material.entity');
  const { RecetaAdicionalVinculacion } = require('../src/app/database/entities/productos/receta-adicional-vinculacion.entity');
  const { Adicional } = require('../src/app/database/entities/productos/adicional.entity');

  // Productos base (ingredientes) + adicional.
  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({ nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10 } as any));
  const queso = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({ nombre: 'QUESO', tipo: 'RETAIL_INGREDIENTE', activo: true } as any));
  const jamon = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({ nombre: 'JAMON', tipo: 'RETAIL_INGREDIENTE', activo: true } as any));
  const sabor = await ds.getRepository(Sabor).save(ds.getRepository(Sabor).create({ nombre: 'MUZZA', categoria: 'PIZZA', activo: true, producto: pizza } as any));
  const adicional = await ds.getRepository(Adicional).save(ds.getRepository(Adicional).create({ nombre: 'EXTRA QUESO', precio: 5000, activo: true } as any));

  const presentaciones: any[] = [];
  for (const [n, c] of [['GRANDE', 3], ['MEDIANA', 2], ['CHICA', 1]] as any[]) {
    presentaciones.push(await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({ nombre: n, cantidad: c, producto: pizza } as any)));
  }

  // MODELO VIEJO: una sola receta compartida por las 3 variaciones + su grafo.
  const receta = await ds.getRepository(Receta).save(ds.getRepository(Receta).create({ nombre: 'PIZZA MUZZA', descripcion: 'BASE', rendimiento: 1, unidadRendimiento: 'UNIDADES', costoCalculado: 0, activo: true } as any));
  const ing1 = await ds.getRepository(RecetaIngrediente).save(ds.getRepository(RecetaIngrediente).create({ cantidad: 200, unidad: 'GRAMOS', costoUnitario: 10, costoTotal: 2000, porcentajeAprovechamiento: 100, activo: true, receta, ingrediente: queso } as any));
  await ds.getRepository(RecetaIngrediente).save(ds.getRepository(RecetaIngrediente).create({ cantidad: 100, unidad: 'GRAMOS', costoUnitario: 20, costoTotal: 2000, porcentajeAprovechamiento: 100, activo: true, receta, ingrediente: jamon } as any));
  await ds.getRepository(RecetaIngredienteIntercambiable).save(ds.getRepository(RecetaIngredienteIntercambiable).create({ costoExtra: 500, activo: true, recetaIngrediente: ing1, ingredienteOpcion: jamon } as any));
  const fase = await ds.getRepository(RecetaFase).save(ds.getRepository(RecetaFase).create({ orden: 1, titulo: 'ARMADO', descripcion: 'ESTIRAR Y CUBRIR', activo: true, receta } as any));
  await ds.getRepository(RecetaFaseIngrediente).save(ds.getRepository(RecetaFaseIngrediente).create({ fase, recetaIngrediente: ing1 } as any));
  await ds.getRepository(RecetaMaterial).save(ds.getRepository(RecetaMaterial).create({ descripcion: 'CAJA', orden: 1, activo: true, receta } as any));
  await ds.getRepository(RecetaAdicionalVinculacion).save(ds.getRepository(RecetaAdicionalVinculacion).create({ precioAdicional: 7000, cantidad: 1, unidad: 'UNIDADES', activo: true, receta, adicional } as any));

  // Las 3 variaciones comparten la MISMA receta.
  for (const pres of presentaciones) {
    await ds.getRepository(RecetaPresentacion).save(ds.getRepository(RecetaPresentacion).create({ nombre_generado: `PIZZA ${pres.nombre} MUZZA`, receta, presentacion: pres, sabor, activo: true } as any));
  }

  console.log('\n[reparar-recetas] === DES-COMPARTIR ===');
  const res = await desduplicarRecetasCompartidas(ds.manager);
  ok(res.recetasCompartidas === 1 && res.variacionesReparadas === 2, 'reparó 2 variaciones (de 1 receta compartida)', res);

  // Cada variación con receta distinta.
  const rps = await ds.getRepository(RecetaPresentacion).find({ relations: ['receta'] });
  const recetaIds = rps.map((r: any) => r.receta?.id);
  ok(new Set(recetaIds).size === 3, 'las 3 variaciones tienen recetas DISTINTAS', recetaIds);

  // Cada receta (original + 2 clones) tiene el grafo completo.
  let okGrafo = true;
  for (const rid of new Set(recetaIds)) {
    const ings = await ds.getRepository(RecetaIngrediente).count({ where: { receta: { id: rid as number } } });
    const fases = await ds.getRepository(RecetaFase).count({ where: { receta: { id: rid as number } } });
    const mats = await ds.getRepository(RecetaMaterial).count({ where: { receta: { id: rid as number } } });
    const vincs = await ds.getRepository(RecetaAdicionalVinculacion).count({ where: { receta: { id: rid as number } } });
    if (ings !== 2 || fases !== 1 || mats !== 1 || vincs !== 1) { okGrafo = false; console.error('  grafo receta', rid, { ings, fases, mats, vincs }); }
  }
  ok(okGrafo, 'cada receta (original + clones) tiene 2 ingredientes, 1 fase, 1 material, 1 adicional');

  // Intercambiables y fase-ingredientes clonados (3 recetas × 1 c/u = 3 en total).
  const totalInter = await ds.getRepository(RecetaIngredienteIntercambiable).count();
  const totalFaseIng = await ds.getRepository(RecetaFaseIngrediente).count();
  ok(totalInter === 3, 'intercambiables clonados (1 por receta = 3)', totalInter);
  ok(totalFaseIng === 3, 'fase-ingredientes clonados (1 por receta = 3)', totalFaseIng);

  // Independencia: editar un ingrediente de un clon no toca los otros.
  const clonId = recetaIds.find((id: any) => id !== receta.id);
  const ingClon = await ds.getRepository(RecetaIngrediente).findOne({ where: { receta: { id: clonId } } });
  await ds.getRepository(RecetaIngrediente).update(ingClon!.id, { cantidad: 999 } as any);
  const origIngs = await ds.getRepository(RecetaIngrediente).find({ where: { receta: { id: receta.id } } });
  ok(origIngs.every((i: any) => Number(i.cantidad) !== 999), 'editar el clon NO afecta la receta original');

  // Idempotencia: correr de nuevo no repara nada.
  const res2 = await desduplicarRecetasCompartidas(ds.manager);
  ok(res2.variacionesReparadas === 0, 'idempotente: segunda corrida repara 0', res2);

  await ds.destroy();
  console.log(`\n[reparar-recetas] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[reparar-recetas] FATAL:', e); process.exit(1); });
