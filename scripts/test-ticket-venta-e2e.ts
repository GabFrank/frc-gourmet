/**
 * E2E: contenido del ticket de venta / pre-cuenta (`buildVentaTicketLines`).
 *
 * Valida contra SQLite, sin impresora, que:
 *  - un `VentaItem` con `estado = CANCELADO` NO se imprime,
 *  - tampoco suma a `bruto` / `descItems` / al TOTAL impreso — crítico en la
 *    pre-cuenta, donde `venta.total` todavía es null y el total sale del
 *    cálculo local (era el bug: el cliente veía un total inflado),
 *  - un ítem cancelado con descuento propio no ensucia el SUBTOTAL/DESCUENTO,
 *  - los adicionales/extras `activo = true` se listan bajo su producto,
 *  - los `activo = false` y los de un ítem cancelado NO se listan,
 *  - con `venta.total` ya escrito (post-cobro) el TOTAL impreso lo respeta.
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-ticket-venta-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { buildVentaTicketLines } from '../electron/handlers/documentos-tickets.handler';
import { renderTicketToPlainText, invalidateTicketEmpresaCache } from '../electron/utils/ticket.utils';

const WIDTH = 48;

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Texto plano del ticket, para asertar presencia/ausencia de líneas. */
function render(lines: any[], width: number = WIDTH): string {
  return renderTicketToPlainText({ printerWidth: width, lines, cutAtEnd: true });
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-ticket-venta.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[ticket-venta] Migraciones OK.');
  invalidateTicketEmpresaCache();

  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { VentaItemAdicional } = require('../src/app/database/entities/ventas/venta-item-adicional.entity');
  const { Producto } = require('../src/app/database/entities/productos/producto.entity');
  const { Adicional } = require('../src/app/database/entities/productos/adicional.entity');
  const { Moneda } = require('../src/app/database/entities/financiero/moneda.entity');

  // Moneda principal (para que los totales se expresen en una sola moneda y no
  // aparezcan líneas "TOTAL <otra moneda>" que dependan de cotizaciones).
  await ds.getRepository(Moneda).save(ds.getRepository(Moneda).create({
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0,
  } as any));

  const mkProducto = (nombre: string) => ds.getRepository(Producto).save(ds.getRepository(Producto).create({
    nombre, tipo: 'RETAIL', activo: true,
  } as any));

  const pHamburguesa = await mkProducto('HAMBURGUESA');
  const pGaseosa = await mkProducto('GASEOSA');
  const pTarta = await mkProducto('TARTA');

  const mkAdicional = (nombre: string) => ds.getRepository(Adicional).save(ds.getRepository(Adicional).create({
    nombre, precioBase: 5000, activo: true,
  } as any));

  const aQueso = await mkAdicional('EXTRA QUESO');
  const aTocino = await mkAdicional('TOCINO');
  const aCebolla = await mkAdicional('CEBOLLA CARAMELIZADA');

  // Venta ABIERTA (pre-cuenta: `total` sigue null, se escribe al cobrar).
  const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'ABIERTA' } as any));

  const mkItem = (producto: any, opts: {
    pvu: number; cantidad?: number; estado?: string; adicionales?: number; descuento?: number;
  }) => ds.getRepository(VentaItem).save(ds.getRepository(VentaItem).create({
    venta,
    producto,
    precioCostoUnitario: 0,
    precioVentaUnitario: opts.pvu,
    precioAdicionales: opts.adicionales || 0,
    descuentoUnitario: opts.descuento || 0,
    cantidad: opts.cantidad ?? 1,
    estado: opts.estado || 'ACTIVO',
  } as any));

  // HAMBURGUESA activa 30.000 + 8.000 de extras
  const itemActivo = await mkItem(pHamburguesa, { pvu: 30000, adicionales: 8000 });
  // GASEOSA activa 10.000, sin extras
  const itemSimple = await mkItem(pGaseosa, { pvu: 10000 });
  // TARTA CANCELADA 25.000 con 3.000 de extras y 5.000 de descuento propio
  const itemCancelado = await mkItem(pTarta, {
    pvu: 25000, adicionales: 3000, descuento: 5000, estado: 'CANCELADO',
  });

  const mkAdicionalItem = (item: any, adicional: any, extra: { cantidad?: number; activo?: boolean } = {}) =>
    ds.getRepository(VentaItemAdicional).save(ds.getRepository(VentaItemAdicional).create({
      ventaItem: item,
      adicional,
      precioCobrado: 5000,
      cantidad: extra.cantidad ?? 1,
      activo: extra.activo !== false,
    } as any));

  await mkAdicionalItem(itemActivo, aQueso);                          // activo, cantidad 1
  await mkAdicionalItem(itemActivo, aTocino, { cantidad: 2 });        // activo, cantidad 2
  await mkAdicionalItem(itemActivo, aCebolla, { activo: false });     // dado de baja
  await mkAdicionalItem(itemCancelado, aQueso);                       // activo, pero del ítem cancelado

  // ── Pre-cuenta (venta.total null) ───────────────────────────────────────
  const pre = await buildVentaTicketLines(ds, venta.id, { width: WIDTH, isPrecuenta: true });
  ok(!!pre, 'buildVentaTicketLines devuelve contenido para la venta');
  const texto = render(pre!.lines);

  // Ítems: sólo los ACTIVOS
  ok(pre!.itemsImpresos === 2, 'imprime 2 ítems (los ACTIVOS), no 3', pre!.itemsImpresos);
  ok(texto.includes('HAMBURGUESA'), 'el ítem activo aparece en el ticket');
  ok(texto.includes('GASEOSA'), 'el segundo ítem activo aparece en el ticket');
  ok(!texto.includes('TARTA'), 'el ítem CANCELADO no aparece en el ticket');

  // Totales: el cancelado no suma ni resta nada
  // bruto esperado = (30000 + 8000) + 10000 = 48000
  ok(pre!.bruto === 48000, 'bruto = 48.000 (sin el cancelado)', pre!.bruto);
  ok(pre!.descItems === 0, 'descItems = 0 (el descuento del cancelado no cuenta)', pre!.descItems);
  ok(pre!.descuentoTotal === 0, 'descuentoTotal = 0', pre!.descuentoTotal);
  ok(pre!.totalPrincipal === 48000, 'TOTAL = 48.000', pre!.totalPrincipal);
  ok(texto.includes('48.000'), 'el TOTAL impreso dice 48.000');
  // Regresión del bug: con el cancelado incluido el total daba 71.000
  // (48000 + 25000 + 3000 - 5000). Ese número no puede aparecer.
  ok(!texto.includes('71.000'), 'regresión: el total ya no incluye el ítem cancelado');
  ok(!texto.includes('SUBTOTAL'), 'sin descuentos vigentes no se imprime SUBTOTAL');

  // Adicionales/extras
  ok(texto.includes('+ EXTRA QUESO'), 'lista el extra activo bajo su producto');
  ok(texto.includes('+ 2x TOCINO'), 'lista el extra activo con su cantidad');
  ok(!texto.includes('CEBOLLA'), 'no lista el extra con activo = false');
  const lineasQueso = texto.split('\n').filter(l => l.includes('EXTRA QUESO')).length;
  ok(lineasQueso === 1, 'el extra del ítem cancelado no se lista (1 sola línea de EXTRA QUESO)', lineasQueso);

  // El extra se lista inmediatamente después de su producto, no al final.
  const lineas = texto.split('\n');
  const idxProducto = lineas.findIndex(l => l.includes('HAMBURGUESA'));
  const idxExtra = lineas.findIndex(l => l.includes('+ EXTRA QUESO'));
  ok(idxProducto >= 0 && idxExtra === idxProducto + 1, 'el extra va pegado debajo de su producto', { idxProducto, idxExtra });

  // ── Ítem activo con descuento propio → SUBTOTAL/DESCUENTO ───────────────
  await ds.getRepository(VentaItem).update({ id: itemSimple.id }, { descuentoUnitario: 2000 } as any);
  const conDesc = await buildVentaTicketLines(ds, venta.id, { width: WIDTH, isPrecuenta: true });
  ok(conDesc!.descItems === 2000, 'descItems = 2.000 (sólo el del ítem activo)', conDesc!.descItems);
  ok(conDesc!.totalPrincipal === 46000, 'TOTAL con descuento = 46.000', conDesc!.totalPrincipal);
  const textoDesc = render(conDesc!.lines);
  ok(textoDesc.includes('SUBTOTAL'), 'con descuento se imprime SUBTOTAL');
  ok(textoDesc.includes('48.000'), 'el SUBTOTAL impreso es el bruto de los activos (48.000)');
  await ds.getRepository(VentaItem).update({ id: itemSimple.id }, { descuentoUnitario: 0 } as any);

  // ── Comprobante post-cobro (camino real: `Venta.total` nunca se persiste) ─
  // Ningún flujo del repo escribe `Venta.total`, así que el comprobante también
  // recalcula en vivo → el cancelado también lo inflaba acá, no sólo en la pre-cuenta.
  await ds.getRepository(Venta).update({ id: venta.id }, { estado: 'CONCLUIDA' } as any);
  const post = await buildVentaTicketLines(ds, venta.id, { width: WIDTH });
  const textoPost = render(post!.lines);
  ok(post!.totalPrincipal === 48000, 'comprobante sin venta.total: TOTAL recalculado = 48.000', post!.totalPrincipal);
  ok(textoPost.includes('COMPROBANTE DE VENTA'), 'comprobante lleva su título');
  ok(!textoPost.includes('TARTA'), 'comprobante: el ítem CANCELADO tampoco aparece');
  ok(textoPost.includes('+ 2x TOCINO'), 'comprobante: también detalla los extras');

  // Rama defensiva: si algún día se persiste `Venta.total`, el ticket lo respeta.
  await ds.getRepository(Venta).update({ id: venta.id }, { total: 44000 } as any);
  const postConTotal = await buildVentaTicketLines(ds, venta.id, { width: WIDTH });
  ok(postConTotal!.totalPrincipal === 44000, 'con venta.total persistido, el TOTAL lo respeta', postConTotal!.totalPrincipal);
  await ds.getRepository(Venta).update({ id: venta.id }, { total: null } as any);

  // ── Impresora angosta: 58mm / 32 columnas ───────────────────────────────
  // Es el ancho donde la sub-línea del extra puede desbordar: cantW=5,
  // descW=32-5-12=15, así que el extra dispone de 27 columnas.
  const angosto = await buildVentaTicketLines(ds, venta.id, { width: 32, isPrecuenta: true });
  const lineasAngostas = render(angosto!.lines, 32).split('\n');
  const desborde = lineasAngostas.filter(l => l.length > 32);
  ok(desborde.length === 0, 'a 32 columnas ninguna línea desborda el ancho', desborde);
  const extraAngosto = lineasAngostas.find(l => l.includes('CEBOLLA') === false && l.trimStart().startsWith('+ '));
  ok(!!extraAngosto, 'a 32 columnas el extra sigue saliendo como sub-línea', extraAngosto);

  // ── Todos los ítems cancelados → no se imprime nada ─────────────────────
  await ds.getRepository(VentaItem).update({ venta: { id: venta.id } } as any, { estado: 'CANCELADO' } as any);
  const vacio = await buildVentaTicketLines(ds, venta.id, { width: WIDTH, isPrecuenta: true });
  ok(vacio!.itemsImpresos === 0, 'sin ítems activos → itemsImpresos = 0', vacio!.itemsImpresos);
  ok(vacio!.bruto === 0, 'sin ítems activos → bruto = 0', vacio!.bruto);
  const textoVacio = render(vacio!.lines);
  ok(!textoVacio.includes('HAMBURGUESA') && !textoVacio.includes('GASEOSA'), 'sin ítems activos no se lista ningún producto');
  // `printVentaTicketInternal` corta ahí y devuelve error en vez de gastar papel
  // (no se testea acá porque requiere una impresora configurada).

  // ── Venta inexistente ───────────────────────────────────────────────────
  const nula = await buildVentaTicketLines(ds, 999999, { width: WIDTH });
  ok(nula === null, 'venta inexistente → null');

  // ═══════ Encabezado de ubicacion: MESA y COMANDA ═══════
  // El bug: era un if/else, asi que una comanda CON mesa nunca imprimia su
  // numero. Dos cuentas en la misma mesa salian con tickets identicos.
  console.log('\n[ubicacion] Encabezado MESA / COMANDA');
  {
    const { buildEncabezadoUbicacion } = require('../electron/handlers/documentos-tickets.handler');
    const tt = (t: string, o?: any) => ({ t, o });
    const textos = (ls: any[]) => ls.map((l: any) => l.t).join('|');

    ok(textos(buildEncabezadoUbicacion(5, null, tt)) === 'MESA|5', 'ubicacion: solo mesa');
    ok(textos(buildEncabezadoUbicacion(null, '#3', tt)) === 'COMANDA|#3', 'ubicacion: solo comanda');
    ok(textos(buildEncabezadoUbicacion(5, '#3', tt)) === 'MESA|5|COMANDA|#3',
      'ubicacion: mesa Y comanda juntas (el bug reportado)',
      textos(buildEncabezadoUbicacion(5, '#3', tt)));
    ok(textos(buildEncabezadoUbicacion(null, null, tt)) === 'PARA LLEVAR',
      'ubicacion: sin nada -> PARA LLEVAR');
    ok(textos(buildEncabezadoUbicacion(0, null, tt)) === 'MESA|0',
      'ubicacion: mesa 0 no se confunde con ausente');
    const conAmbas = buildEncabezadoUbicacion(5, '#3', tt);
    ok(conAmbas[3].o.size === 'tall', 'ubicacion: con mesa, la comanda no compite en tamano');
    ok(buildEncabezadoUbicacion(null, '#3', tt)[1].o.size === 'big',
      'ubicacion: sola, la comanda va en grande');
  }

  await ds.destroy();
  console.log(`\n[ticket-venta] ${passed} OK, ${failed} FALLARON`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
