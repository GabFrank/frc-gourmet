/**
 * Tienda online F6: categorías propias de la carta (docs/planes/PLAN-tienda-online-F6-ux-carta.md).
 *
 * Cubre: el armado puro de las pestañas (fallback a familias, orden, inactivas, vacías, «Otros»,
 * producto en varias, producto que deja de estar online), el agrupado del storefront, el CRUD y
 * reorden con sus validaciones y permiso, el `get-menu-online` real, y la migración up/down.
 *
 * Uso: npm run test:tienda-categorias
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler, installHandlerRegistry } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { armarCategoriasTienda, ID_OTROS_TIENDA } from '../electron/utils/tienda-categorias.utils';
import { registerPedidosOnlineAdminHandlers } from '../electron/handlers/pedidos-online-admin.handler';
import { registerPedidosOnlineHandlers } from '../electron/handlers/pedidos-online.handler';
import { TiendaCategorias1793727684955 } from '../src/app/database/migrations/1793727684955-TiendaCategorias';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  // ── 1 · Armado puro ───────────────────────────────────────────────────────
  console.log('\n[1] armarCategoriasTienda');
  const fam = [{ id: 1, nombre: 'PIZZAS' }, { id: 2, nombre: 'BEBIDAS' }];
  ok(armarCategoriasTienda(fam, [10, 11], []) === fam, 'sin categorías de tienda: las de familia, tal cual');
  ok(armarCategoriasTienda(fam, [10], [{ id: 1, nombre: 'X', orden: 0, activo: false, productos: [{ productoId: 10, orden: 0 }] }]) === fam,
    'solo inactivas: las de familia');
  const r = armarCategoriasTienda(fam, [10, 11, 12, 13], [
    { id: 5, nombre: 'PROMOS', orden: 1, activo: true, productos: [{ productoId: 12, orden: 1 }, { productoId: 10, orden: 0 }] },
    { id: 6, nombre: 'ENTRADAS', orden: 0, activo: true, productos: [{ productoId: 11, orden: 0 }, { productoId: 10, orden: 1 }] },
    { id: 7, nombre: 'VACIA', orden: 2, activo: true, productos: [{ productoId: 99, orden: 0 }] },
    { id: 8, nombre: 'APAGADA', orden: 3, activo: false, productos: [{ productoId: 13, orden: 0 }] },
  ]);
  ok(r.map((c) => c.nombre).join(',') === 'ENTRADAS,PROMOS,OTROS', 'orden de pestañas; vacía e inactiva no salen; «Otros» al final', r);
  ok(JSON.stringify(r[0].productoIds) === '[11,10]' && JSON.stringify(r[1].productoIds) === '[10,12]', 'productos en su orden; el 10 en dos categorías', r);
  ok(r[2].id === ID_OTROS_TIENDA && JSON.stringify(r[2].productoIds) === '[13]', '«Otros» con lo que no está en ninguna activa', r[2]);
  ok(!r.some((c) => c.productoIds?.includes(99)), 'un producto que no está en la carta (no online) no aparece');
  const sinResto = armarCategoriasTienda(fam, [10], [{ id: 1, nombre: 'A', orden: 0, activo: true, productos: [{ productoId: 10, orden: 0 }] }]);
  ok(sinResto.length === 1, 'sin productos sueltos no hay «Otros»', sinResto);

  // ── 2 · Agrupado del storefront ──────────────────────────────────────────
  console.log('\n[2] storefront agruparPorCategoria');
  const { agruparPorCategoria } = require('../projects/storefront/src/app/core/menu-agrupar');
  const card = (productoId: number, categoriaId: any, saborId: any = null) => ({ productoId, saborId, titulo: `P${productoId}${saborId ?? ''}`, categoriaId });
  const cards = [card(10, 1), card(11, 2), card(12, 1, 1), card(12, 1, 2)];
  const vFam = agruparPorCategoria([{ id: 1, nombre: 'A' }, { id: 2, nombre: 'B' }, { id: 3, nombre: 'C' }], cards);
  ok(vFam.length === 2 && vFam[0].cards.length === 3, 'por familia (categoriaId); la vacía no sale', vFam.map((v: any) => v.cards.length));
  const vTienda = agruparPorCategoria([{ id: 'tc-1', nombre: 'X', productoIds: [12, 10] }, { id: 'tc-2', nombre: 'Y', productoIds: [10] }], cards);
  ok(vTienda[0].cards.map((c: any) => c.titulo).join(',') === 'P121,P122,P10', 'por tienda: en el orden configurado, con todos los sabores de la pizza', vTienda[0].cards);
  ok(vTienda[1].cards.length === 1, 'un producto puede estar en dos pestañas');

  // ── 3 · Handlers contra SQLite ───────────────────────────────────────────
  console.log('\n[3] CRUD, reorden y menú');
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-tienda-categorias.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const R = (e: any) => ds.getRepository(e);
  const save = (e: any, data: any) => R(e).save(R(e).create(data));
  const { Usuario } = E('personas/usuario.entity');
  const { Permission } = E('personas/permission.entity');
  const { Role } = E('personas/role.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { TipoPrecio } = E('financiero/tipo-precio.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { PrecioVenta } = E('productos/precio-venta.entity');

  const admin = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const sinPermiso = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  const role = await save(Role, { descripcion: 'ADMIN', activo: true });
  const permiso = await save(Permission, { codigo: 'PEDIDOS_ONLINE_CONFIGURAR', descripcion: 'x', activo: true });
  await save(RolePermission, { role, permission: permiso });
  await save(UsuarioRole, { usuario: admin, role });

  const moneda = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true });
  const tipoPrecio = await save(TipoPrecio, { descripcion: 'NORMAL', activo: true });
  const familia = await save(Familia, { nombre: 'COMIDAS', activo: true });
  const subfamilia = await save(Subfamilia, { nombre: 'VARIOS', activo: true, familia });
  const prod = async (nombre: string, online = true) => {
    const p = await save(Producto, { nombre, tipo: 'RETAIL', activo: true, esVendible: true, disponibleOnline: online, pausadoOnline: false, iva: 10, subfamilia });
    const pres = await save(Presentacion, { nombre: 'UNIDAD', cantidad: 1, principal: true, producto: p });
    await save(PrecioVenta, { valor: 10000, principal: true, activo: true, moneda, tipoPrecio, presentacion: pres });
    return p;
  };
  const empanada = await prod('EMPANADA');
  const papas = await prod('PAPAS');
  const coca = await prod('COCA');
  const oculto = await prod('OCULTO', false);

  let user: any = admin;
  installHandlerRegistry();
  registerPedidosOnlineAdminHandlers(ds, () => user);
  registerPedidosOnlineHandlers(ds, () => user);

  const menu0: any = await invokeHandler('get-menu-online');
  ok(menu0.categorias.length === 1 && menu0.categorias[0].nombre === 'COMIDAS' && !menu0.categorias[0].productoIds,
    'sin categorías de tienda, el menú agrupa por familia como antes', menu0.categorias);

  const vacio: any = await invokeHandler('guardar-tienda-categoria', { nombre: '  ' });
  ok(vacio?.success === false && vacio.error === 'nombre_requerido', 'nombre vacío: rechazado', vacio);
  const malo: any = await invokeHandler('guardar-tienda-categoria', { nombre: 'X', productoIds: [999999] });
  ok(malo?.success === false && malo.error === 'producto_inexistente', 'producto inexistente: rechazado', malo);

  const ent: any = await invokeHandler('guardar-tienda-categoria', { nombre: 'entradas', productoIds: [papas.id, empanada.id, papas.id, oculto.id] });
  ok(ent?.success && ent.categoria.nombre === 'ENTRADAS', 'alta en mayúscula', ent);
  ok(ent.categoria.productos.map((p: any) => p.productoId).join(',') === [papas.id, empanada.id, oculto.id].join(','), 'productos en orden y sin repetidos', ent.categoria.productos);
  const beb: any = await invokeHandler('guardar-tienda-categoria', { nombre: 'Bebidas', productoIds: [coca.id, empanada.id] });
  ok(beb?.success && beb.categoria.orden === 1, 'la nueva va al final', beb.categoria);

  const menu1: any = await invokeHandler('get-menu-online');
  ok(menu1.categorias.map((c: any) => c.nombre).join(',') === 'ENTRADAS,BEBIDAS', 'el menú usa las categorías de la tienda', menu1.categorias);
  ok(JSON.stringify(menu1.categorias[0].productoIds) === JSON.stringify([papas.id, empanada.id]), 'el producto no online no sale aunque esté asignado', menu1.categorias[0]);

  await invokeHandler('reordenar-tienda-categorias', [beb.categoria.id, ent.categoria.id]);
  const menu2: any = await invokeHandler('get-menu-online');
  ok(menu2.categorias[0].nombre === 'BEBIDAS', 'reordenar cambia el orden de las pestañas', menu2.categorias);

  const ed: any = await invokeHandler('guardar-tienda-categoria', { id: beb.categoria.id, nombre: 'BEBIDAS', activo: false, productoIds: [coca.id] });
  ok(ed?.success && ed.categoria.activo === false && ed.categoria.productos.length === 1, 'editar reemplaza productos y apaga', ed);
  const menu3: any = await invokeHandler('get-menu-online');
  ok(menu3.categorias.map((c: any) => c.nombre).join(',') === 'ENTRADAS,OTROS' && menu3.categorias[1].productoIds.includes(coca.id),
    'la inactiva no sale y su producto cae en «Otros»', menu3.categorias);

  await invokeHandler('eliminar-tienda-categoria', ent.categoria.id);
  const quedan: any = await invokeHandler('get-tienda-categorias-admin');
  const huerfanas = await ds.query(`SELECT COUNT(*) AS n FROM "tienda_categoria_productos" WHERE "categoria_id" = ?`, [ent.categoria.id]);
  ok(quedan.length === 1 && Number(huerfanas[0].n) === 0, 'eliminar borra la categoría y sus asignaciones', { quedan, huerfanas });
  const menu4: any = await invokeHandler('get-menu-online');
  ok(menu4.categorias.length === 1 && menu4.categorias[0].nombre === 'COMIDAS', 'sin activas vuelve a agrupar por familia', menu4.categorias);

  user = sinPermiso;
  let negado = false;
  try { await invokeHandler('guardar-tienda-categoria', { nombre: 'X' }); } catch { negado = true; }
  ok(negado, 'sin PEDIDOS_ONLINE_CONFIGURAR no se puede editar');
  user = admin;

  // ── 4 · Migración down/up en SQLite ──────────────────────────────────────
  console.log('\n[4] Migración SQLite');
  const qr = ds.createQueryRunner();
  const mig = new TiendaCategorias1793727684955();
  await mig.down(qr);
  ok(!(await qr.hasTable('tienda_categorias')) && !(await qr.hasTable('tienda_categoria_productos')), 'down borra las dos tablas');
  await mig.up(qr);
  await mig.up(qr);
  ok(await qr.hasTable('tienda_categorias') && await qr.hasTable('tienda_categoria_productos'), 'up crea las tablas y es idempotente');
  await qr.release();
  await ds.destroy();

  // ── 5 · Migración en Postgres (si hay uno local) ─────────────────────────
  // Base Postgres de prueba (como test:locks-pg): FRC_PG_*; sin FRC_PG_DATABASE se saltea.
  const pgDb = process.env['FRC_PG_DATABASE'];
  if (pgDb) {
    console.log('\n[5] Migración Postgres');
    const pg = new DataSource({
      type: 'postgres', host: process.env['FRC_PG_HOST'] || 'localhost',
      port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432, database: pgDb,
      username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres', password: process.env['FRC_PG_PASSWORD'] || undefined,
    } as any);
    await pg.initialize();
    await pg.query(`CREATE TABLE IF NOT EXISTS "producto" ("id" SERIAL PRIMARY KEY)`);
    const q = pg.createQueryRunner();
    await mig.up(q);
    await mig.up(q);
    ok(await q.hasTable('tienda_categorias') && await q.hasTable('tienda_categoria_productos'), 'up en Postgres, idempotente');
    await mig.down(q);
    ok(!(await q.hasTable('tienda_categorias')), 'down en Postgres');
    await q.release();
    await pg.destroy();
  } else {
    console.log('\n[5] Migración Postgres: sin FRC_PG_DATABASE, se saltea');
  }

  console.log(`\n${passed} ok, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
