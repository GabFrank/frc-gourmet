/**
 * #189 — revertir el costo promedio al anular una compra (docs/planes/PLAN-189-costo-anular-compra.md).
 *
 * - Última compra → costo EXACTO (con y sin costo previo), un solo costo activo.
 * - Compras posteriores → RECALCULADO igual a reproducir solo las vigentes (con ventas en el medio).
 * - Inventario inicial con costo MANUAL → el recálculo parte de ese costo.
 * - Costo MANUAL posterior → SIN_CAMBIO; los costos de la compra anulada se apagan.
 * - Compra vieja sin snapshot → RECALCULADO.
 * - Producto sin control de stock; anulaciones encadenadas (no reactiva el costo de una anulada).
 * - Migración idempotente.
 *
 * Uso: npm run test:costo-anular-compra  (Postgres: COSTO_PG=<base vacía> npm run test:costo-anular-compra)
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerComprasHandlers } from '../electron/handlers/compras.handler';
import { reproducirCosto, promedioPonderado } from '../electron/utils/costo-compra.utils';
import { CompraDetalleSnapshotCosto1794700000000 } from '../src/app/database/migrations/1794700000000-CompraDetalleSnapshotCosto';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
const cerca = (a: any, b: number) => a != null && Math.abs(Number(a) - b) < 0.011;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ---- Puras ----
  console.log('[costo] puras');
  ok(promedioPonderado(0, 100, 10, 200) === 200, 'stock 0 → costo de la compra');
  ok(promedioPonderado(10, null, 10, 200) === 200, 'sin costo → costo de la compra');
  ok(promedioPonderado(10, 100, 10, 200) === 150, 'ponderado');
  const lpc = new Map([[1, [{ costo: 100 }]], [3, [{ costo: 400 }]]]);
  ok(reproducirCosto([
    { tipo: 'COMPRA', cantidad: 10, compraId: 1 }, { tipo: 'VENTA', cantidad: 5 }, { tipo: 'COMPRA', cantidad: 10, compraId: 3 },
  ], lpc) === 300, 'replay con venta en el medio');
  ok(reproducirCosto([{ tipo: 'COSTO', cantidad: 0, costoFijo: 50 }, { tipo: 'AJUSTE_POSITIVO', cantidad: 10 }, { tipo: 'COMPRA', cantidad: 10, compraId: 3 }], lpc) === 225,
    'replay parte de un costo manual');

  // ---- BD ----
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-costo-anular-compra.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['COSTO_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  console.log(`[costo] ${pgDb ? 'postgres' : 'sqlite'}`);
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  const mqr = ds.createQueryRunner();
  await new CompraDetalleSnapshotCosto1794700000000().up(mqr);
  await mqr.release();
  ok(true, 'migración idempotente (corrida 2 veces)');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { Permission } = E('personas/permission.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { Proveedor } = E('compras/proveedor.entity');
  const { CompraDetalle } = E('compras/compra-detalle.entity');
  const { StockMovimiento } = E('productos/stock-movimiento.entity');
  const { PrecioCosto } = E('productos/precio-costo.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);
  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['COMPRAS_GESTIONAR', 'COMPRAS_VER']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });
  registerComprasHandlers(ds, () => admin);

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const prov: any = await save(Proveedor, { nombre: 'PROVEEDOR TEST', activo: true });
  let n = 0;
  const producto = async (controlaStock: boolean) => {
    const p: any = await save(Producto, { nombre: `PROD ${++n}`, tipo: 'RETAIL', activo: true, esComprable: true, controlaStock });
    const pres: any = await save(Presentacion, { producto: p, nombre: 'UNIDAD', cantidad: 1, principal: true, activo: true });
    return { p, pres };
  };
  const hoy = new Date().toISOString().slice(0, 10);
  const comprar = async (pp: any, lineas: [number, number][]) => {
    const c: any = await invokeHandler('create-compra-borrador', {
      proveedorId: prov.id, monedaId: pyg.id, fechaCompra: hoy,
      detalles: lineas.map(([cantidad, costo]) => ({ productoId: pp.p.id, presentacionId: pp.pres.id, cantidad, costoUnitarioPresentacion: costo })),
    });
    await invokeHandler('finalizar-compra', c.id, {});
    await sleep(pgDb ? 5 : 1100); // created_at distinto entre eventos (SQLite guarda segundos)
    return c.id as number;
  };
  const activos = async (pp: any) => (await ds.getRepository(PrecioCosto).createQueryBuilder('pc')
    .where('pc.producto_id = :p', { p: pp.p.id }).andWhere('pc.activo = true').orderBy('pc.id', 'DESC').getMany());
  const costo = async (pp: any) => { const a = await activos(pp); return a.length ? Number(a[0].valor) : null; };
  const stock = async (pp: any) => {
    const m: any[] = await ds.getRepository(StockMovimiento).createQueryBuilder('m').where('m.producto_id = :p', { p: pp.p.id }).getMany();
    return m.reduce((s, x) => s + (['COMPRA', 'AJUSTE_POSITIVO'].includes(x.tipo) ? 1 : -1) * Number(x.cantidad), 0);
  };
  const vender = async (pp: any, cantidad: number) => {
    await save(StockMovimiento, { producto: { id: pp.p.id }, cantidad, tipo: 'VENTA', tipoReferencia: 'VENTA', referencia: 999, fecha: new Date(), activo: true });
    await sleep(pgDb ? 5 : 1100);
  };
  const anular = (id: number) => invokeHandler('anular-compra', id, 'test') as Promise<any>;

  // 1) Snapshot al finalizar
  console.log('[costo] snapshot');
  const p1 = await producto(true);
  const a1 = await comprar(p1, [[10, 100]]);
  const d1: any = await ds.getRepository(CompraDetalle).findOne({ where: { compra: { id: a1 } } });
  ok(d1.precioCostoId != null && d1.precioCostoPrevioId == null, 'primera compra: guarda su costo y previo null', d1);
  const b1 = await comprar(p1, [[10, 200]]);
  ok(cerca(await costo(p1), 150), 'costo ponderado 150');

  // 2) EXACTO: anular la última
  console.log('[costo] exacto');
  const r1 = await anular(b1);
  ok(r1.costos?.[0]?.modo === 'EXACTO', 'modo EXACTO', r1.costos);
  ok(cerca(await costo(p1), 100), 'vuelve exacto a 100');
  ok((await activos(p1)).length === 1, 'un solo costo activo');
  ok(await stock(p1) === 10, 'stock vuelve a 10');
  const r1b = await anular(a1);
  ok(r1b.costos?.[0]?.modo === 'EXACTO' && (await costo(p1)) === null, 'anular la única: queda sin costo, como antes', r1b.costos);

  // 3) RECALCULADO: compras posteriores, con venta en el medio
  console.log('[costo] recalculado');
  const p2 = await producto(true);
  const a2 = await comprar(p2, [[10, 100]]);
  await vender(p2, 5);
  const b2 = await comprar(p2, [[10, 200]]);
  ok(cerca(await costo(p2), 166.67), 'con B: 166,67', await costo(p2));
  const c2 = await comprar(p2, [[10, 400]]);
  ok(cerca(await costo(p2), 260), 'con C: (15×166,67 + 10×400)/25 = 260', await costo(p2));
  const r2 = await anular(b2);
  ok(r2.costos?.[0]?.modo === 'RECALCULADO', 'modo RECALCULADO', r2.costos);
  ok(cerca(await costo(p2), 300), 'recalculado sin B: (5×100 + 10×400)/15 = 300', await costo(p2));
  ok((await activos(p2)).length === 1, 'un solo costo activo');
  // Encadenada: anular C (la última vigente) → el costo vuelve a A, sin reactivar el de B (anulada)
  const r2c = await anular(c2);
  ok(cerca(await costo(p2), 100), 'anular C después: vuelve a 100 (solo A)', { c: await costo(p2), r: r2c.costos });
  ok(await stock(p2) === 5, 'stock 5 (10 − 5 vendidos)');
  void a2;

  // 4) Inventario inicial con costo MANUAL: el recálculo parte de ese costo
  console.log('[costo] ancla manual');
  const p3 = await producto(true);
  await save(PrecioCosto, { producto: { id: p3.p.id }, moneda: { id: pyg.id }, fuente: 'MANUAL', valor: 50, fecha: hoy, activo: true });
  await save(StockMovimiento, { producto: { id: p3.p.id }, cantidad: 10, tipo: 'AJUSTE_POSITIVO', tipoReferencia: 'AJUSTE', referencia: null, fecha: new Date(), activo: true });
  await sleep(pgDb ? 5 : 1100);
  const a3 = await comprar(p3, [[10, 150]]);
  ok(cerca(await costo(p3), 100), 'manual 50 + A 150 → 100');
  await comprar(p3, [[10, 300]]);
  ok(cerca(await costo(p3), 166.67), '+ B 300 → 166,67');
  await anular(a3);
  ok(cerca(await costo(p3), 175), 'sin A: (10×50 + 10×300)/20 = 175', await costo(p3));
  const b3 = (await ds.query(`SELECT MAX(compra_id) AS id FROM compras_detalles WHERE producto_id = ${p3.p.id}`))[0].id;
  await anular(Number(b3));
  ok(cerca(await costo(p3), 50) && (await activos(p3)).length === 1, 'anular también B: vuelve el costo manual 50 (no queda sin costo)', await activos(p3));

  // 5) Costo MANUAL posterior: no se pisa; los de la compra se apagan
  console.log('[costo] manual posterior');
  const p4 = await producto(true);
  const a4 = await comprar(p4, [[10, 100]]);
  await save(PrecioCosto, { producto: { id: p4.p.id }, moneda: { id: pyg.id }, fuente: 'MANUAL', valor: 80, fecha: hoy, activo: true });
  const r4 = await anular(a4);
  ok(r4.costos?.[0]?.modo === 'SIN_CAMBIO' && !!r4.costos[0].aviso, 'SIN_CAMBIO con aviso', r4.costos);
  ok(cerca(await costo(p4), 80) && (await activos(p4)).length === 1, 'queda solo el manual 80 activo');

  // 6) Compra vieja sin snapshot
  console.log('[costo] sin snapshot');
  const p5 = await producto(true);
  const a5 = await comprar(p5, [[10, 100]]);
  const b5 = await comprar(p5, [[10, 300]]);
  await ds.query(`UPDATE compras_detalles SET precio_costo_id = NULL, precio_costo_previo_id = NULL WHERE compra_id IN (${a5}, ${b5})`);
  const r5 = await anular(b5);
  ok(r5.costos?.[0]?.modo === 'RECALCULADO' && cerca(await costo(p5), 100), 'sin snapshot → recalcula: 100', r5.costos);

  // 7) Dos líneas del mismo producto en la compra
  console.log('[costo] dos líneas');
  const p6 = await producto(true);
  await comprar(p6, [[10, 100]]);
  const b6 = await comprar(p6, [[10, 200], [10, 500]]);
  ok(cerca(await costo(p6), 266.67), '100,200,500 → 266,67', await costo(p6));
  const r6 = await anular(b6);
  ok(r6.costos?.[0]?.modo === 'EXACTO' && cerca(await costo(p6), 100), 'anular la de 2 líneas → 100', r6.costos);

  // 8) Sin control de stock
  console.log('[costo] sin stock');
  const p7 = await producto(false);
  const a7 = await comprar(p7, [[1, 8000]]);
  const b7 = await comprar(p7, [[1, 9000]]);
  await anular(a7);
  ok(cerca(await costo(p7), 9000), 'anular la vieja: queda la última, 9000', await costo(p7));
  await anular(b7);
  ok((await costo(p7)) === null, 'anular la otra: sin costo de compra (no reactiva el de la anulada)', await activos(p7));

  await ds.destroy();
  console.log(`\n[costo] ${passed} OK, ${failed} fallaron`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
