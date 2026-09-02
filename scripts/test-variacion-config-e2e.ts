/**
 * E2E de la CONFIG DE VARIACIONES POR PRODUCTO.
 *
 * El máximo de sabores combinables y la estrategia de precio vivían sólo en
 * `PdvConfig` (una regla para todo el local): la pizza admite mitad y mitad y
 * la milanesa con variación heredaba lo mismo. Ahora el producto puede
 * sobreescribirlo (`max_variaciones_simultaneas`, `estrategia_precio_variacion`)
 * y `null` sigue heredando el global.
 *
 * Uso: npm run test:variacion-config
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerProductosHandlers } from '../electron/handlers/productos.handler';
import { getVariacionConfig, getVariacionConfigGlobal } from '../electron/utils/variacion-config.utils';
import { getPizzaConfig } from '../electron/handlers/pedidos-online-config.handler';

let passed = 0;
let failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function seed(ds: DataSource): Promise<any> {
  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { PdvConfig } = require('../src/app/database/entities/ventas/pdv-config.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');

  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'PRODUCTOS_GESTIONAR', descripcion: 'Productos', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  // Global del PdV: hasta 2 sabores, el más caro manda.
  await ds.getRepository(PdvConfig).save(ds.getRepository(PdvConfig).create({
    cantidad_mesas: 4, pizzaMaxSabores: 2, pizzaEstrategiaPrecio: 'MAYOR_PRECIO',
  } as any));

  const pizza = await ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre: 'PIZZA', tipo: 'ELABORADO_CON_VARIACION', activo: true, esVendible: true, iva: 10,
  } as any));

  return { admin, pizza };
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-variacion-config.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[variacion-config] Migraciones OK.');

  const s = await seed(ds);
  registerProductosHandlers(ds, () => s.admin);

  console.log('\n[variacion-config] === HERENCIA DEL GLOBAL ===');
  const global = await getVariacionConfigGlobal(ds);
  ok(global.maxSabores === 2 && global.estrategia === 'MAYOR_PRECIO', 'global: 2 sabores / MAYOR_PRECIO', global);
  const heredada = await getVariacionConfig(ds, s.pizza.id);
  ok(heredada.maxSabores === 2 && heredada.estrategia === 'MAYOR_PRECIO', 'producto sin override hereda el global', heredada);
  ok(heredada.personalizada === false, 'producto sin override no figura como personalizado');

  console.log('\n[variacion-config] === OVERRIDE POR PRODUCTO ===');
  // Milanesa: un solo sabor por ítem (sin mitad y mitad) y precio promedio.
  const mila: any = await invokeHandlerWithContext('create-producto', undefined, {
    nombre: 'MILANESITA', tipo: 'ELABORADO_CON_VARIACION', unidadBase: 'UNIDAD', iva: 10,
    esVendible: true, maxVariacionesSimultaneas: 1, estrategiaPrecioVariacion: 'PROMEDIO',
  });
  ok(mila?.maxVariacionesSimultaneas === 1, 'create-producto guarda el máximo por producto', mila?.maxVariacionesSimultaneas);
  const cfgMila = await getVariacionConfig(ds, mila.id);
  ok(cfgMila.maxSabores === 1, 'override: 1 sabor por ítem', cfgMila);
  ok(cfgMila.estrategia === 'PROMEDIO', 'override: estrategia PROMEDIO', cfgMila);
  ok(cfgMila.personalizada === true, 'override: marcado como personalizado');

  // La carta online cotiza con la config del producto, no con la global.
  const pizzaOnline = await getPizzaConfig(ds, s.pizza.id);
  const milaOnline = await getPizzaConfig(ds, mila.id);
  ok(pizzaOnline.maxSabores === 2, 'online: la pizza sigue admitiendo 2 sabores', pizzaOnline);
  ok(milaOnline.maxSabores === 1 && milaOnline.estrategia === 'PROMEDIO', 'online: la milanesa queda en 1 sabor', milaOnline);
  const sinProducto = await getPizzaConfig(ds);
  ok(sinProducto.maxSabores === 2, 'online sin producto: rige el global', sinProducto);

  console.log('\n[variacion-config] === VOLVER AL GLOBAL Y VALORES INVÁLIDOS ===');
  await invokeHandlerWithContext('update-producto', undefined, mila.id, {
    maxVariacionesSimultaneas: null, estrategiaPrecioVariacion: null,
  });
  const cfgVuelta = await getVariacionConfig(ds, mila.id);
  ok(cfgVuelta.maxSabores === 2 && cfgVuelta.estrategia === 'MAYOR_PRECIO', 'null vuelve a heredar el global', cfgVuelta);

  await invokeHandlerWithContext('update-producto', undefined, mila.id, {
    maxVariacionesSimultaneas: 0, estrategiaPrecioVariacion: 'CUALQUIERA',
  });
  const cfgInvalida = await getVariacionConfig(ds, mila.id);
  ok(cfgInvalida.maxSabores === 2 && cfgInvalida.estrategia === 'MAYOR_PRECIO', 'valores inválidos se descartan (heredan el global)', cfgInvalida);

  console.log('\n[variacion-config] === PAYLOAD DE LA BÚSQUEDA (PdV / PWA) ===');
  await invokeHandlerWithContext('update-producto', undefined, mila.id, {
    maxVariacionesSimultaneas: 1, estrategiaPrecioVariacion: 'PROMEDIO',
  });
  const buscados: any[] = await invokeHandlerWithContext('search-productos-by-nombre', undefined, 'MILANESITA', 'venta');
  const vm = (buscados || []).find((x: any) => x.id === mila.id);
  ok(vm?.variacionConfig?.maxSabores === 1, 'búsqueda: variacionConfig.maxSabores = 1', vm?.variacionConfig);
  ok(vm?.variacionConfig?.estrategia === 'PROMEDIO', 'búsqueda: variacionConfig.estrategia = PROMEDIO', vm?.variacionConfig);

  await ds.destroy();
  console.log(`\n[variacion-config] RESULTADO: ${passed} passed, ${failed} failed.`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('[variacion-config] FATAL:', e); process.exit(1); });
