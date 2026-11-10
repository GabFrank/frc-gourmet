/**
 * E2E: clasificación de ítems de compra (docs/planes/PLAN-clasificacion-items-compras.md).
 *
 * - Migración: semilla de 7 clases, columnas nuevas, idempotente (corre 2 veces).
 * - resolverClaseLinea: línea → producto → subfamilia → null.
 * - Borrador: guarda la clase heredada y la de override; reclasificar el producto
 *   después no cambia la línea. Cliente viejo sin claseId hereda.
 * - Finalizar: stock y costo igual que siempre (no dependen de la clase).
 * - Alias: upsert crea, actualiza marca/contenido, respeta la unique, se desactiva.
 * - Reporte: agrupa por destino y clase, prorratea al total (diferencia 0),
 *   «Sin clasificar», «Sin detalle» (simplificada), excluye anuladas, borradores aparte,
 *   clase desactivada sigue saliendo marcada.
 *
 * Uso: npm run test:clasificacion-compras
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandler } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerComprasHandlers } from '../electron/handlers/compras.handler';
import { registerCompraClasesHandlers } from '../electron/handlers/compra-clases.handler';
import { resolverClaseLinea, agruparReporteCompras } from '../electron/utils/compra-clase.utils';
import { ClasificacionItemsCompra1794356000000 } from '../src/app/database/migrations/1794356000000-ClasificacionItemsCompra';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}
async function esperaError(fn: () => Promise<any>, patron: RegExp, name: string) {
  try { await fn(); ok(false, name, 'no lanzó'); }
  catch (e: any) { ok(patron.test(e?.message || ''), name, e?.message); }
}

async function main() {
  // ---- Puras ----
  console.log('[clasif] resolverClaseLinea');
  ok(resolverClaseLinea(null, { claseId: null, subfamilia: { claseId: 3 } }) === 3, 'hereda de la subfamilia');
  ok(resolverClaseLinea(null, { claseId: 2, subfamilia: { claseId: 3 } }) === 2, 'producto pisa subfamilia');
  ok(resolverClaseLinea(5, { claseId: 2, subfamilia: { claseId: 3 } }) === 5, 'línea pisa producto');
  ok(resolverClaseLinea(undefined, { subfamilia: null }) === null, 'sin nada → null');
  ok(resolverClaseLinea(null, null) === null, 'sin producto → null');

  const rp = agruparReporteCompras(
    [{ id: 1, total: 100, monedaId: 1, simplificada: false }],
    [{ compraId: 1, subtotal: 33.33, claseId: 1 }, { compraId: 1, subtotal: 33.33, claseId: 1 }, { compraId: 1, subtotal: 33.33, claseId: null }],
    [{ id: 1, nombre: 'X', destino: 'CMV', activo: true }],
  );
  ok(rp.porMoneda[0].diferencia === 0, 'prorrateo cierra exacto con el total', rp.porMoneda);

  // ---- BD ----
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-clasificacion-compras.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[clasif] Migraciones OK.');

  const qr = ds.createQueryRunner();
  await new ClasificacionItemsCompra1794356000000().up(qr);
  await qr.release();
  const semilla: any[] = await ds.query(`SELECT * FROM compra_item_clase ORDER BY orden`);
  ok(semilla.length === 7, 'semilla de 7 clases, idempotente (migración corrida 2 veces)', semilla.length);
  ok(semilla.filter((c) => c.destino === 'CMV').length === 2, '2 clases a CMV (insumo y packaging)');
  ok(semilla.some((c) => c.nombre === 'BEBIDA DE REVENTA' && c.destino === 'REVENTA'), 'bebida de reventa → REVENTA');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Usuario } = E('personas/usuario.entity');
  const { Role } = E('personas/role.entity');
  const { Permission } = E('personas/permission.entity');
  const { RolePermission } = E('personas/role-permission.entity');
  const { UsuarioRole } = E('personas/usuario-role.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { Familia } = E('productos/familia.entity');
  const { Subfamilia } = E('productos/subfamilia.entity');
  const { Producto } = E('productos/producto.entity');
  const { Presentacion } = E('productos/presentacion.entity');
  const { Proveedor } = E('compras/proveedor.entity');
  const { Compra } = E('compras/compra.entity');
  const { StockMovimiento } = E('productos/stock-movimiento.entity');

  const save = (ent: any, data: any) => ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const admin: any = await save(Usuario, { nickname: 'admin', password: 'x', activo: true });
  const role: any = await save(Role, { descripcion: 'ADMIN', activo: true });
  for (const cod of ['COMPRAS_GESTIONAR', 'COMPRAS_VER', 'COMPRAS_DASHBOARD_VER']) {
    const perm: any = await save(Permission, { codigo: cod, descripcion: cod, activo: true });
    await save(RolePermission, { role, permission: perm });
  }
  await save(UsuarioRole, { usuario: admin, role });
  const sinPermiso: any = await save(Usuario, { nickname: 'mozo', password: 'x', activo: true });
  let actual: any = admin;
  registerComprasHandlers(ds, () => actual);
  registerCompraClasesHandlers(ds, () => actual);

  const pyg: any = await save(Moneda, { denominacion: 'GUARANI', simbolo: 'Gs', principal: true, decimales: 0, activo: true });
  const usd: any = await save(Moneda, { denominacion: 'DOLAR', simbolo: 'US$', principal: false, decimales: 2, activo: true });
  const clase = (n: string) => semilla.find((c) => c.nombre === n).id as number;
  const INSUMO = clase('INSUMO DE PRODUCCIÓN'), BEBIDA = clase('BEBIDA DE REVENTA'), LIMPIEZA = clase('LIMPIEZA E HIGIENE');
  const PACK = clase('DESCARTABLE/PACKAGING');

  const fam: any = await save(Familia, { nombre: 'LIMPIEZA E HIGIENE', activo: true });
  const subLimpieza: any = await save(Subfamilia, { nombre: 'GENERAL', activo: true, familia: fam, claseId: LIMPIEZA });
  const famC: any = await save(Familia, { nombre: 'COCINA', activo: true });
  const subCocina: any = await save(Subfamilia, { nombre: 'INSUMOS', activo: true, familia: famC, claseId: INSUMO });
  const lavandina: any = await save(Producto, { nombre: 'LAVANDINA 1 L', tipo: 'RETAIL', activo: true, esComprable: true, controlaStock: false, subfamilia: subLimpieza });
  const harina: any = await save(Producto, { nombre: 'HARINA 000', tipo: 'RETAIL', activo: true, esComprable: true, controlaStock: true, subfamilia: subCocina });
  const cerveza: any = await save(Producto, { nombre: 'CORONA 600 ML', tipo: 'RETAIL', activo: true, esComprable: true, controlaStock: true, claseId: BEBIDA });
  const sinClase: any = await save(Producto, { nombre: 'VARIOS', tipo: 'RETAIL', activo: true, esComprable: true, controlaStock: false });
  const pres = async (p: any, nombre: string, cantidad: number) => save(Presentacion, { producto: p, nombre, cantidad, principal: true, activo: true });
  const pLav: any = await pres(lavandina, 'UNIDAD', 1);
  const pHar: any = await pres(harina, 'BOLSA 25 KG', 25);
  const pCer: any = await pres(cerveza, 'CAJA X12', 12);
  const pVar: any = await pres(sinClase, 'UNIDAD', 1);
  const prov: any = await save(Proveedor, { nombre: 'EMBALACLEAN', activo: true });

  // ---- Clases: ABM ----
  console.log('[clasif] ABM de clases');
  await esperaError(() => invokeHandler('create-compra-item-clase', { nombre: 'X', destino: 'COSA' }), /Destino inválido/, 'destino inválido se rechaza');
  await esperaError(() => invokeHandler('create-compra-item-clase', { nombre: 'otros', destino: 'CMV' }), /Ya existe/, 'nombre repetido se rechaza');
  actual = sinPermiso;
  await esperaError(() => invokeHandler('create-compra-item-clase', { nombre: 'GAS', destino: 'GASTO_OPERATIVO' }), /permis/i, 'sin COMPRAS_GESTIONAR no crea');
  actual = admin;
  const gas: any = await invokeHandler('create-compra-item-clase', { nombre: 'gas', destino: 'GASTO_OPERATIVO', controlaStockPorDefecto: false, orden: 80 });
  ok(gas.nombre === 'GAS' && gas.activo === true, 'crea clase en mayúsculas');
  const activas: any[] = await invokeHandler('get-compra-item-clases');
  ok(activas.length === 8, 'lista 8 activas');

  // ---- Borrador ----
  console.log('[clasif] Borrador guarda la clase');
  const hoy = new Date().toISOString().slice(0, 10);
  const borr: any = await invokeHandler('create-compra-borrador', {
    proveedorId: prov.id, monedaId: pyg.id, fechaCompra: hoy, detalles: [
      { productoId: lavandina.id, presentacionId: pLav.id, cantidad: 10, costoUnitarioPresentacion: 8000, textoOriginal: 'LAVANDINA AYUDIN 1L' },
      { productoId: harina.id, presentacionId: pHar.id, cantidad: 2, costoUnitarioPresentacion: 150000 },
      { productoId: cerveza.id, presentacionId: pCer.id, cantidad: 3, costoUnitarioPresentacion: 157628 },
      { productoId: harina.id, presentacionId: pHar.id, cantidad: 1, costoUnitarioPresentacion: 20000, claseId: PACK },
      { productoId: sinClase.id, presentacionId: pVar.id, cantidad: 1, costoUnitarioPresentacion: 5000 },
    ],
  });
  const det = (i: number) => borr.detalles.sort((a: any, b: any) => a.id - b.id)[i];
  ok(det(0).claseId === LIMPIEZA, 'lavandina hereda limpieza de la subfamilia', det(0).claseId);
  ok(det(0).textoOriginal === 'LAVANDINA AYUDIN 1L', 'guarda el texto original');
  ok(det(1).claseId === INSUMO, 'harina hereda insumo');
  ok(det(2).claseId === BEBIDA, 'cerveza toma la clase del producto');
  ok(det(3).claseId === PACK, 'override por línea se respeta');
  ok(det(4).claseId === null, 'producto sin clase queda «Sin clasificar»');

  // Reclasificar el producto después no cambia la línea guardada
  await ds.getRepository(Producto).update(lavandina.id, { claseId: gas.id });
  const relee: any = await invokeHandler('getCompra', borr.id);
  ok(relee.detalles.find((d: any) => d.id === det(0).id).claseId === LIMPIEZA, 'reclasificar el producto no cambia la línea');

  // update-compra-borrador (reemplaza detalles): cliente viejo sin claseId hereda la clase NUEVA del producto
  const upd: any = await invokeHandler('update-compra-borrador', borr.id, {
    detalles: borr.detalles.map((d: any) => ({
      productoId: d.producto.id, presentacionId: d.presentacion.id, cantidad: Number(d.cantidad),
      costoUnitarioPresentacion: Number(d.costoUnitarioPresentacion),
      ...(d.claseId === PACK ? { claseId: PACK } : {}),
    })),
  });
  const lav2 = upd.detalles.find((d: any) => d.producto.id === lavandina.id);
  ok(lav2.claseId === gas.id, 'al reemplazar sin claseId hereda la clase vigente');
  ok(upd.detalles.some((d: any) => d.claseId === PACK), 'override se conserva al reemplazar');
  await ds.getRepository(Producto).update(lavandina.id, { claseId: null });

  // ---- Finalizar: stock/costo como siempre ----
  console.log('[clasif] Finalizar');
  await invokeHandler('finalizar-compra', borr.id, {});
  const movHar = await ds.getRepository(StockMovimiento).createQueryBuilder('m').where('m.producto_id = :p', { p: harina.id }).getMany();
  const movLav = await ds.getRepository(StockMovimiento).createQueryBuilder('m').where('m.producto_id = :p', { p: lavandina.id }).getMany();
  ok(movHar.reduce((s: number, m: any) => s + Number(m.cantidad), 0) === 75, 'harina suma 75 kg (3 bolsas de 25)', movHar.map((m: any) => m.cantidad));
  ok(movLav.length === 0, 'lavandina (no controla stock) no mueve stock');

  // ---- Alias ----
  console.log('[clasif] Alias con marca');
  const a1: any = await invokeHandler('upsert-alias-producto', { proveedorId: prov.id, textoOcr: 'LAVANDINA AYUDIN 1L', productoId: lavandina.id, presentacionId: pLav.id, marca: 'Ayudín', contenido: '1 L', codigoProveedor: 'A-123' });
  ok(a1.marca === 'Ayudín' && a1.contenido === '1 L' && a1.codigoProveedor === 'A-123', 'crea alias con marca/contenido/código');
  const a2: any = await invokeHandler('upsert-alias-producto', { proveedorId: prov.id, textoOcr: 'LAVANDINA AYUDIN 1L', productoId: lavandina.id, marca: 'Ayudín Original' });
  ok(a2.id === a1.id && a2.marca === 'Ayudín Original' && a2.contenido === '1 L', 'mismo proveedor+texto+producto actualiza, conserva lo no enviado');
  await invokeHandler('upsert-alias-producto', { proveedorId: prov.id, textoOcr: 'LAVANDINA SANITOL 1L', productoId: lavandina.id, marca: 'Sanitol' });
  let lista: any[] = await invokeHandler('get-alias-productos-proveedor', prov.id);
  ok(lista.length === 2, 'dos marcas → dos alias del mismo genérico', lista.length);
  await invokeHandler('upsert-alias-producto', { id: a1.id, activo: false });
  lista = await invokeHandler('get-alias-productos-proveedor', prov.id);
  ok(lista.length === 1, 'alias desactivado no se lista');
  await esperaError(() => invokeHandler('upsert-alias-producto', { proveedorId: prov.id }), /necesita/, 'alias incompleto se rechaza');

  // ---- Reporte ----
  console.log('[clasif] Reporte por clase');
  // Simplificada (sin detalle) y una anulada
  await save(Compra, { estado: 'FINALIZADO', simplificada: true, activo: true, total: 300000, fechaCompra: hoy, moneda: pyg, proveedor: prov, credito: false });
  const anulada: any = await invokeHandler('create-compra-borrador', { proveedorId: prov.id, monedaId: pyg.id, fechaCompra: hoy, detalles: [{ productoId: harina.id, presentacionId: pHar.id, cantidad: 1, costoUnitarioPresentacion: 999999 }] });
  await invokeHandler('finalizar-compra', anulada.id, {});
  await invokeHandler('anular-compra', anulada.id, 'prueba de anulación');
  // Borrador abierto
  await invokeHandler('create-compra-borrador', { proveedorId: prov.id, monedaId: pyg.id, fechaCompra: hoy, detalles: [{ productoId: harina.id, presentacionId: pHar.id, cantidad: 1, costoUnitarioPresentacion: 1000 }] });
  // Otra moneda
  const dol: any = await invokeHandler('create-compra-borrador', { proveedorId: prov.id, monedaId: usd.id, fechaCompra: hoy, detalles: [{ productoId: cerveza.id, presentacionId: pCer.id, cantidad: 1, costoUnitarioPresentacion: 20 }] });
  await invokeHandler('finalizar-compra', dol.id, {});
  // Clase desactivada sigue saliendo
  await invokeHandler('update-compra-item-clase', PACK, { activo: false });

  const rep: any = await invokeHandler('get-reporte-compras-por-clase', { desde: hoy, hasta: hoy });
  const fila = (m: number, dest: string, cid: number | null) => rep.filas.find((f: any) => f.monedaId === m && f.destino === dest && f.claseId === cid);
  ok(fila(pyg.id, 'CMV', INSUMO)?.monto === 300000, 'CMV insumo = 2 × 150.000', fila(pyg.id, 'CMV', INSUMO));
  ok(fila(pyg.id, 'CMV', PACK)?.monto === 20000 && fila(pyg.id, 'CMV', PACK)?.claseActiva === false, 'packaging (clase inactiva) sale marcado');
  ok(fila(pyg.id, 'REVENTA', BEBIDA)?.monto === 472884, 'reventa = 3 × 157.628');
  ok(fila(pyg.id, 'GASTO_OPERATIVO', gas.id)?.monto === 80000, 'lavandina quedó en la clase que tomó al reemplazar el borrador (10 × 8.000)');
  ok(fila(pyg.id, 'SIN_CLASIFICAR', null)?.monto === 5000, '«Sin clasificar» = 5.000');
  ok(fila(pyg.id, 'SIN_DETALLE', null)?.monto === 300000, 'simplificada sale como «Sin detalle»');
  ok(fila(usd.id, 'REVENTA', BEBIDA)?.monto === 20, 'otra moneda aparte, sin convertir');
  const mPyg = rep.porMoneda.find((m: any) => m.monedaId === pyg.id);
  ok(mPyg.totalCompras === 1177884 && mPyg.diferencia === 0, 'total de compras PYG (sin la anulada) concilia, diferencia 0', mPyg);
  ok(rep.compras === 3, '3 compras no anuladas (mixta, simplificada, USD)', rep.compras);
  ok(rep.borradores.find((b: any) => b.monedaId === pyg.id)?.cantidad === 1, 'borrador informado aparte');
  const soloUsd: any = await invokeHandler('get-reporte-compras-por-clase', { desde: hoy, hasta: hoy, monedaId: usd.id });
  ok(soloUsd.filas.every((f: any) => f.monedaId === usd.id), 'filtro por moneda');
  await esperaError(() => invokeHandler('get-reporte-compras-por-clase', { desde: '10/11/2026', hasta: hoy }), /AAAA-MM-DD/, 'fecha mal formada se rechaza');
  actual = sinPermiso;
  await esperaError(() => invokeHandler('get-reporte-compras-por-clase', { desde: hoy, hasta: hoy }), /permis/i, 'reporte pide COMPRAS_DASHBOARD_VER');
  await esperaError(() => invokeHandler('get-alias-productos-proveedor', prov.id), /permis/i, 'alias pide COMPRAS_VER');
  actual = admin;

  await ds.destroy();
  console.log(`\n[clasif] ${passed} OK, ${failed} fallaron`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
