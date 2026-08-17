/**
 * E2E: flow de producto ELABORADO_CON_VARIACION (pizza) tal como lo manda el
 * PWA mobile, contra los handlers reales.
 *
 * El PWA no podía personalizar ingredientes: elegía tamaño y sabores y, por
 * sabor, sólo adicionales/observaciones/nota. Ahora manda además las
 * modificaciones de ingredientes (REMOVIDO / INTERCAMBIADO) con la FK del sabor,
 * igual que el PdV desktop.
 *
 * Valida el contrato de persistencia que usa `tomar-pedido.page.ts`:
 *  - VentaItem con recetaPresentacion principal, ensamblado y cantidadSabores,
 *  - un VentaItemSabor por sabor con su proporción,
 *  - adicionales / observaciones / modificaciones colgados del ítem y
 *    **atribuidos al sabor correcto** vía `ventaItemSabor`,
 *  - la nota libre por sabor (una fila, sin observación del catálogo),
 *  - que la comanda de cocina imprima el `SIN X` del sabor que corresponde.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-variacion-mobile-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-variacion-mobile.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[variacion-mobile] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { VentaItemSabor } = require('../src/app/database/entities/ventas/venta-item-sabor.entity');
  const { VentaItemAdicional } = require('../src/app/database/entities/ventas/venta-item-adicional.entity');
  const { VentaItemObservacion } = require('../src/app/database/entities/ventas/venta-item-observacion.entity');
  const {
    VentaItemIngredienteModificacion,
  } = require('../src/app/database/entities/ventas/venta-item-ingrediente-modificacion.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Presentacion } = require('../src/app/database/entities/productos/presentacion.entity');
  const { Receta } = require('../src/app/database/entities/productos/receta.entity');
  const { RecetaIngrediente } = require('../src/app/database/entities/productos/receta-ingrediente.entity');
  const { RecetaPresentacion } = require('../src/app/database/entities/productos/receta-presentacion.entity');
  const { Sabor } = require('../src/app/database/entities/productos/sabor.entity');
  const { Adicional } = require('../src/app/database/entities/productos/adicional.entity');
  const { Observacion } = require('../src/app/database/entities/productos/observacion.entity');

  // ── Seed ────────────────────────────────────────────────────────────────
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true,
  } as any));
  const mediano = await ds.getRepository(Presentacion).save(ds.getRepository(Presentacion).create({
    producto: pizza, nombre: 'MEDIANO', cantidad: 1, principal: true, activo: true,
  } as any));

  // Dos sabores, cada uno con su receta (refactor 2026-07: una receta por variación).
  const mkSabor = async (nombre: string, ingredientes: string[]) => {
    const sabor = await ds.getRepository(Sabor).save(ds.getRepository(Sabor).create({ nombre, categoria: 'PIZZA', activo: true } as any));
    const receta = await ds.getRepository(Receta).save(ds.getRepository(Receta).create({ nombre: `RECETA ${nombre}`, activo: true } as any));
    const ings: any[] = [];
    for (const ing of ingredientes) {
      // `unidad` va explícita: la entidad la declara nullable pero la columna es
      // NOT NULL en la baseline (desajuste preexistente entidad↔schema).
      ings.push(await ds.getRepository(RecetaIngrediente).save(ds.getRepository(RecetaIngrediente).create({
        receta, descripcion: ing, unidad: 'UNIDADES', esOpcional: true, activo: true, cantidad: 1,
      } as any)));
    }
    const rp = await ds.getRepository(RecetaPresentacion).save(ds.getRepository(RecetaPresentacion).create({
      producto: pizza, presentacion: mediano, sabor, receta,
      nombre_generado: `PIZZA MEDIANO ${nombre}`,
      costo_calculado: 20000, activo: true,
    } as any));
    return { sabor, receta, rp, ings };
  };
  const calabresa = await mkSabor('CALABRESA', ['ACEITUNAS', 'CEBOLLA']);
  const muzzarella = await mkSabor('MUZZARELLA', ['ORÉGANO']);

  const borde = await ds.getRepository(Adicional).save(ds.getRepository(Adicional).create({ nombre: 'BORDE CHEDDAR', precioBase: 10000, activo: true } as any));
  const obsBuscar = await ds.getRepository(Observacion).save(ds.getRepository(Observacion).create({ descripcion: 'BUSCAR', activo: true } as any));

  const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'ABIERTA' } as any));

  registerVentasHandlers(ds, () => admin);

  // ── El PWA arma la pizza: mitad CALABRESA (sin aceitunas + borde cheddar +
  //    observación + nota) y mitad MUZZARELLA (sin cambios) ─────────────────
  // Precio: MAYOR_PRECIO = 100.000; adicional 10.000 en media pizza → 5.000.
  const item: any = await invokeHandlerWithContext('createVentaItem', undefined, {
    producto: { id: pizza.id },
    presentacion: { id: mediano.id },
    cantidad: 1,
    precioVentaUnitario: 100000,
    precioCostoUnitario: 20000,
    venta: { id: venta.id },
    recetaPresentacion: { id: calabresa.rp.id },
    ensambladoDescripcion: 'PIZZA MEDIANO 1/2 CALABRESA + 1/2 MUZZARELLA',
    cantidadSabores: 2,
    precioAdicionales: 5000,
    estado: 'ACTIVO',
  });
  ok(!!item?.id, 'se crea el VentaItem de la pizza', item?.id);

  const saborCal: any = await invokeHandlerWithContext('createVentaItemSabor', undefined, {
    ventaItemId: item.id, recetaPresentacionId: calabresa.rp.id, proporcion: 0.5,
    precioReferencia: 100000, costoReferencia: 20000,
  });
  const saborMuz: any = await invokeHandlerWithContext('createVentaItemSabor', undefined, {
    ventaItemId: item.id, recetaPresentacionId: muzzarella.rp.id, proporcion: 0.5,
    precioReferencia: 80000, costoReferencia: 20000,
  });
  ok(!!saborCal?.id && !!saborMuz?.id, 'se crean los dos VentaItemSabor');

  // Personalización SOLO de la mitad calabresa.
  await invokeHandlerWithContext('createVentaItemIngredienteModificacion', undefined, {
    ventaItem: { id: item.id },
    recetaIngrediente: { id: calabresa.ings[0].id }, // ACEITUNAS
    tipoModificacion: 'REMOVIDO',
    ventaItemSabor: { id: saborCal.id },
  });
  await invokeHandlerWithContext('createVentaItemAdicional', undefined, {
    ventaItem: { id: item.id }, adicional: { id: borde.id }, precioCobrado: 10000, cantidad: 1,
    ventaItemSabor: { id: saborCal.id },
  });
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item.id }, observacion: { id: obsBuscar.id }, ventaItemSabor: { id: saborCal.id },
  });
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item.id }, observacionLibre: 'bien cocida', ventaItemSabor: { id: saborCal.id },
  });

  // ── Verificación de la estructura persistida ────────────────────────────
  const sabores = await ds.getRepository(VentaItemSabor).find({
    where: { ventaItem: { id: item.id } } as any,
    relations: ['recetaPresentacion', 'recetaPresentacion.sabor'],
  });
  ok(sabores.length === 2, 'el ítem queda con 2 sabores', sabores.length);
  ok(sabores.every((s: any) => Math.abs(Number(s.proporcion) - 0.5) < 0.001), 'ambos sabores al 50%', sabores.map((s: any) => s.proporcion));

  const mods = await ds.getRepository(VentaItemIngredienteModificacion).find({
    where: { ventaItem: { id: item.id } } as any,
    relations: ['recetaIngrediente', 'ventaItemSabor'],
  });
  ok(mods.length === 1, 'se guarda 1 modificación de ingrediente', mods.length);
  ok((mods[0] as any).tipoModificacion === 'REMOVIDO', 'del tipo REMOVIDO', (mods[0] as any).tipoModificacion);
  ok((mods[0] as any).recetaIngrediente?.descripcion === 'ACEITUNAS', 'sobre el ingrediente correcto', (mods[0] as any).recetaIngrediente?.descripcion);
  ok((mods[0] as any).ventaItemSabor?.id === saborCal.id, 'atribuida a la mitad CALABRESA, no a la otra', (mods[0] as any).ventaItemSabor?.id);

  const adics = await ds.getRepository(VentaItemAdicional).find({
    where: { ventaItem: { id: item.id } } as any, relations: ['ventaItemSabor'],
  });
  ok(adics.length === 1 && (adics[0] as any).ventaItemSabor?.id === saborCal.id, 'el adicional cuelga de su sabor');

  const obss = await ds.getRepository(VentaItemObservacion).find({
    where: { ventaItem: { id: item.id } } as any, relations: ['observacion', 'ventaItemSabor'],
  });
  ok(obss.length === 2, 'observación del catálogo + nota libre = 2 filas', obss.length);
  ok(obss.every((o: any) => o.ventaItemSabor?.id === saborCal.id), 'las dos atribuidas al sabor');
  const nota = obss.find((o: any) => o.observacionLibre);
  ok(!!nota, 'la nota libre se guardó (el PWA la manda sin observación)');
  ok((nota as any)?.observacionLibre === 'BIEN COCIDA', 'la nota queda en UPPERCASE', (nota as any)?.observacionLibre);

  // ── Lo que ve la cocina ─────────────────────────────────────────────────
  const { textoObservacionParaTicket } = require('../electron/handlers/documentos-tickets.handler');
  const textos = obss.map((o: any) => textoObservacionParaTicket(o)).sort();
  ok(
    JSON.stringify(textos) === JSON.stringify(['BIEN COCIDA', 'BUSCAR']),
    'la comanda muestra la observación y la nota, sin duplicados',
    textos,
  );
  const nombreIng =
    (mods[0] as any).recetaIngrediente?.ingrediente?.nombre || (mods[0] as any).recetaIngrediente?.descripcion;
  ok(nombreIng === 'ACEITUNAS', 'la comanda puede imprimir "SIN ACEITUNAS" (fallback a descripcion)', nombreIng);

  // ── Precio: el adicional de media pizza se cobró a la mitad ─────────────
  const itemDb: any = await ds.getRepository(VentaItem).findOne({ where: { id: item.id } as any });
  ok(Number(itemDb.precioAdicionales) === 5000, 'precioAdicionales ponderado = 5.000 (no 10.000)', itemDb.precioAdicionales);
  const totalLinea = (Number(itemDb.precioVentaUnitario) + Number(itemDb.precioAdicionales)) * Number(itemDb.cantidad);
  ok(totalLinea === 105000, 'total de la línea = 105.000', totalLinea);

  await ds.destroy();
  console.log(`\n[variacion-mobile] ${passed} OK, ${failed} FALLARON`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
