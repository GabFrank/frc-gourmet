/**
 * E2E del asistente "agregar el mismo ingrediente a otras variaciones".
 *
 * Reproduce el bug reportado (el ingrediente quedaba TRIPLICADO en la receta) y
 * verifica el fix del handler `agregar-ingrediente-multiples-variaciones`:
 *
 *  1. Recetas COMPARTIDAS entre variaciones (datos previos al refactor de 2026-07-11):
 *     antes, las N variaciones resolvían a la MISMA receta y se insertaban N filas
 *     iguales. Ahora se deduplica y se excluye la receta de origen.
 *  2. Re-ejecutar el asistente desde otra variación: no vuelve a insertar donde ya está.
 *  3. Cantidad con conversión de unidad (GRAMOS → KILOGRAMOS): la copia se guarda en la
 *     unidad base, no en la del usuario (antes costeaba 1000× de más).
 *
 * Uso: npm run test:ingrediente-multi-variacion
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

const invoke = (canal: string, ...args: any[]) => invokeHandlerWithContext(canal, undefined, ...args);

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-ingrediente-multi-variacion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[ingrediente-multi-variacion] Migraciones OK.');

  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');
  const { RecetaIngrediente } = require('../src/app/database/entities/productos/receta-ingrediente.entity');
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');

  // Admin con INGREDIENTES_GESTIONAR (el handler lo exige con ensurePermission).
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'INGREDIENTES_GESTIONAR', descripcion: 'Ingredientes', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  registerRecetasHandlers(ds, () => admin);

  const repoProducto = ds.getRepository(Producto);
  const repoPresentacion = ds.getRepository(Presentacion);
  const repoSabor = ds.getRepository(Sabor);
  const repoReceta = ds.getRepository(Receta);
  const repoRP = ds.getRepository(RecetaPresentacion);
  const repoRI = ds.getRepository(RecetaIngrediente);

  const pizza = await repoProducto.save(repoProducto.create({ nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10 } as any));
  const queso = await repoProducto.save(repoProducto.create({ nombre: 'QUESO MOZARELLA', tipo: 'RETAIL_INGREDIENTE', activo: true, unidadBase: 'KILOGRAMO' } as any));
  const sabor = await repoSabor.save(repoSabor.create({ nombre: 'MUZZA', categoria: 'PIZZA', activo: true, producto: pizza } as any));

  const presentaciones: any[] = [];
  for (const [n, c] of [['MEDIANO', 1], ['GRANDE', 2], ['FAMILIAR', 3]] as any[]) {
    presentaciones.push(await repoPresentacion.save(repoPresentacion.create({ nombre: n, cantidad: c, producto: pizza } as any)));
  }

  // ── CASO 1: modelo VIEJO, las 3 variaciones comparten UNA receta ────────────
  console.log('\n[ingrediente-multi-variacion] === CASO 1: recetas compartidas ===');
  const recetaCompartida = await repoReceta.save(repoReceta.create({ nombre: 'PIZZA MUZZA', rendimiento: 1, unidadRendimiento: 'UNIDADES', costoCalculado: 0, activo: true } as any));
  const variacionesCompartidas: any[] = [];
  for (const pres of presentaciones) {
    variacionesCompartidas.push(await repoRP.save(repoRP.create({
      nombre_generado: `PIZZA ${pres.nombre} MUZZA`, receta: recetaCompartida, presentacion: pres, sabor, activo: true
    } as any)));
  }

  // El usuario agrega el ingrediente en la variación MEDIANO (receta compartida).
  const origen = await repoRI.save(repoRI.create({
    cantidad: 0.1, unidad: 'KILOGRAMOS', unidadOriginal: 'GRAMOS',
    costoUnitario: 30000, costoTotal: 3000, porcentajeAprovechamiento: 100,
    activo: true, receta: recetaCompartida, ingrediente: queso
  } as any));

  // …y dice que sí al asistente para las otras 2 variaciones (100 GRAMOS c/u).
  const res1 = await invoke('agregar-ingrediente-multiples-variaciones', {
    recetaIngredienteId: origen.id,
    variaciones: [
      { variacionId: variacionesCompartidas[1].id, cantidad: 100 },
      { variacionId: variacionesCompartidas[2].id, cantidad: 100 }
    ]
  });

  ok(res1.agregadas === 0, 'no inserta nada: las 2 variaciones comparten la receta de origen', res1);
  ok(res1.omitidasPorRecetaCompartida.length === 2, 'reporta las 2 variaciones omitidas por receta compartida', res1.omitidasPorRecetaCompartida);

  const filasCompartida = await repoRI.count({ where: { receta: { id: recetaCompartida.id }, ingrediente: { id: queso.id } } });
  ok(filasCompartida === 1, 'la receta compartida sigue con UNA sola fila del ingrediente (antes: 3)', filasCompartida);

  // ── CASO 2: modelo NUEVO, una receta por variación ──────────────────────────
  console.log('\n[ingrediente-multi-variacion] === CASO 2: receta por variación ===');
  const sabor2 = await repoSabor.save(repoSabor.create({ nombre: 'NAPOLITANA', categoria: 'PIZZA', activo: true, producto: pizza } as any));
  const variaciones2: any[] = [];
  for (const pres of presentaciones) {
    const receta = await repoReceta.save(repoReceta.create({ nombre: `PIZZA ${pres.nombre} NAPOLITANA`, rendimiento: 1, unidadRendimiento: 'UNIDADES', costoCalculado: 0, activo: true } as any));
    variaciones2.push(await repoRP.save(repoRP.create({
      nombre_generado: `PIZZA ${pres.nombre} NAPOLITANA`, receta, presentacion: pres, sabor: sabor2, activo: true
    } as any)));
  }

  const origen2 = await repoRI.save(repoRI.create({
    cantidad: 0.1, unidad: 'KILOGRAMOS', unidadOriginal: 'GRAMOS',
    costoUnitario: 30000, costoTotal: 3000, porcentajeAprovechamiento: 100,
    activo: true, receta: variaciones2[0].receta, ingrediente: queso
  } as any));

  const res2 = await invoke('agregar-ingrediente-multiples-variaciones', {
    recetaIngredienteId: origen2.id,
    variaciones: [
      { variacionId: variaciones2[1].id, cantidad: 150 },
      { variacionId: variaciones2[2].id, cantidad: 200 }
    ]
  });
  ok(res2.agregadas === 2, 'agrega el ingrediente a las 2 recetas destino', res2);

  for (const v of variaciones2) {
    const n = await repoRI.count({ where: { receta: { id: v.receta.id }, ingrediente: { id: queso.id } } });
    if (n !== 1) ok(false, `receta ${v.nombre_generado} debería tener 1 fila`, n);
  }
  ok(true, 'cada una de las 3 recetas quedó con exactamente 1 fila del ingrediente');

  // Conversión de unidad: 150 GRAMOS se guardan como 0.15 KILOGRAMOS.
  const copiaGrande = await repoRI.findOne({ where: { receta: { id: variaciones2[1].receta.id }, ingrediente: { id: queso.id } } });
  ok(Number(copiaGrande!.cantidad) === 0.15, 'la copia se guarda normalizada a la unidad base (0.15 KILOGRAMOS, no 150)', copiaGrande!.cantidad);
  ok(copiaGrande!.unidad === 'KILOGRAMOS' && copiaGrande!.unidadOriginal === 'GRAMOS', 'la copia conserva unidad/unidadOriginal del origen', { unidad: copiaGrande!.unidad, unidadOriginal: copiaGrande!.unidadOriginal });

  // ── CASO 3: correr el asistente OTRA VEZ desde otra variación ───────────────
  console.log('\n[ingrediente-multi-variacion] === CASO 3: segunda corrida del asistente ===');
  const res3 = await invoke('agregar-ingrediente-multiples-variaciones', {
    recetaIngredienteId: copiaGrande!.id,
    variaciones: [
      { variacionId: variaciones2[0].id, cantidad: 150 },
      { variacionId: variaciones2[2].id, cantidad: 150 }
    ]
  });
  ok(res3.agregadas === 0, 'la segunda corrida no agrega nada', res3);
  ok(res3.omitidasPorDuplicado.length === 2, 'reporta las 2 variaciones omitidas por duplicado', res3.omitidasPorDuplicado);

  const totalNapolitana = await repoRI.count({ where: { ingrediente: { id: queso.id } } });
  ok(totalNapolitana === 4, 'total de filas del ingrediente: 1 (compartida) + 3 (napolitana), sin duplicados', totalNapolitana);

  // ── CASO 4: fila desactivada por un borrado previo (soft delete) ────────────
  // `delete-receta-ingrediente` desactiva la fila la primera vez y
  // `get-receta-ingredientes` no filtra `activo`: insertar al lado volvería a
  // mostrar el ingrediente repetido. Debe REACTIVARSE la fila existente.
  console.log('\n[ingrediente-multi-variacion] === CASO 4: fila desactivada ===');
  const copiaFamiliar = await repoRI.findOne({ where: { receta: { id: variaciones2[2].receta.id }, ingrediente: { id: queso.id } } });
  await repoRI.update(copiaFamiliar!.id, { activo: false } as any);

  const bloqueadasAntes = await invoke('get-recetas-con-ingrediente', {
    recetaIds: [variaciones2[2].receta.id],
    ingredienteId: queso.id
  });
  ok(bloqueadasAntes.length === 0, 'una fila desactivada NO bloquea la variación en el diálogo', bloqueadasAntes);

  const res4 = await invoke('agregar-ingrediente-multiples-variaciones', {
    recetaIngredienteId: origen2.id,
    variaciones: [{ variacionId: variaciones2[2].id, cantidad: 250 }]
  });
  ok(res4.agregadas === 1, 'reactiva la variación con la fila desactivada', res4);

  const filasFamiliar = await repoRI.count({ where: { receta: { id: variaciones2[2].receta.id }, ingrediente: { id: queso.id } } });
  ok(filasFamiliar === 1, 'sigue habiendo UNA sola fila (se reactivó, no se insertó otra)', filasFamiliar);

  const reactivada = await repoRI.findOne({ where: { id: copiaFamiliar!.id } });
  ok(reactivada!.activo === true && Number(reactivada!.cantidad) === 0.25, 'la fila reactivada toma la cantidad nueva normalizada', { activo: reactivada!.activo, cantidad: reactivada!.cantidad });

  // ── get-recetas-con-ingrediente: alimenta el bloqueo en el diálogo ──────────
  console.log('\n[ingrediente-multi-variacion] === get-recetas-con-ingrediente ===');
  const conIngrediente = await invoke('get-recetas-con-ingrediente', {
    recetaIds: variaciones2.map((v: any) => v.receta.id),
    ingredienteId: queso.id
  });
  ok(conIngrediente.length === 3, 'las 3 recetas del sabor ya tienen el ingrediente', conIngrediente);

  const sinIngrediente = await invoke('get-recetas-con-ingrediente', {
    recetaIds: variaciones2.map((v: any) => v.receta.id),
    ingredienteId: pizza.id
  });
  ok(sinIngrediente.length === 0, 'ninguna receta tiene un ingrediente que no se cargó', sinIngrediente);

  await ds.destroy();
  console.log(`\n[ingrediente-multi-variacion] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[ingrediente-multi-variacion] FATAL:', e); process.exit(1); });
