/**
 * El `CASE` de SQL y el clasificador de TypeScript dicen lo mismo.
 *
 * `canal-venta.util.ts` (shared, para el renderer) y `canalVentaExpr()`
 * (backend, para agrupar en SQL) son dos implementaciones de la MISMA regla.
 * Dos implementaciones de una regla se separan; es exactamente lo que pasó con
 * `CONCEPTO_ES_INGRESO` / `esIngreso()` en el pago consolidado, y por eso ahí
 * también hay un test que las compara.
 *
 * Acá se crean ventas de las cuatro formas posibles y se exige que las dos
 * rutas coincidan **fila por fila**. Si alguien toca una sola de las dos, este
 * test lo dice.
 *
 * Uso: npm run test:canal-venta
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import { dbQuery } from '../electron/utils/db-query';
import {
  CanalVenta, canalVentaExpr, joinDeliveryCanal, condicionCanal, esCanalValido,
  clasificarCanalVenta, canalDeVenta,
} from '../electron/utils/canal-venta.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-canal-venta.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const base = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[canal-venta] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Venta } = E('ventas/venta.entity');
  const { PdvMesa } = E('ventas/pdv-mesa.entity');
  const { Delivery } = E('ventas/delivery.entity');

  const save = (ent: any, data: any) =>
    ds.getRepository(ent).save(ds.getRepository(ent).create(data as any) as any);

  const mesa: any = await save(PdvMesa, { numero: 1, activo: true });
  const mkDelivery = (modo: string) => save(Delivery, {
    nombre: 'CLIENTE', telefono: '0981', estado: 'ABIERTO', modo,
    fechaAbierto: new Date(), cobroAnticipado: false,
  });

  const casos: { nombre: string; venta: any; esperado: CanalVenta }[] = [];

  casos.push({
    nombre: 'con mesa, sin reparto',
    venta: await save(Venta, { estado: 'CONCLUIDA', mesa, canalOrigen: 'LOCAL' }),
    esperado: CanalVenta.SALON,
  });
  casos.push({
    nombre: 'sin mesa, sin reparto',
    venta: await save(Venta, { estado: 'CONCLUIDA', canalOrigen: 'LOCAL' }),
    esperado: CanalVenta.MOSTRADOR,
  });
  casos.push({
    nombre: 'con reparto DELIVERY',
    venta: await save(Venta, { estado: 'CONCLUIDA', delivery: await mkDelivery('DELIVERY'), canalOrigen: 'LOCAL' }),
    esperado: CanalVenta.DELIVERY,
  });
  casos.push({
    nombre: 'con reparto RETIRO',
    venta: await save(Venta, { estado: 'CONCLUIDA', delivery: await mkDelivery('RETIRO'), canalOrigen: 'WEB' }),
    esperado: CanalVenta.RETIRO,
  });
  // Arrastre de datos: un reparto que además quedó con mesa. El reparto gana;
  // clasificarlo como SALÓN lo borraría de los informes de delivery, que es el
  // error caro. Los dos caminos tienen que coincidir también acá.
  casos.push({
    nombre: 'con reparto Y mesa (el reparto gana)',
    venta: await save(Venta, { estado: 'CONCLUIDA', mesa, delivery: await mkDelivery('DELIVERY'), canalOrigen: 'LOCAL' }),
    esperado: CanalVenta.DELIVERY,
  });

  console.log('\n[canal-venta] === SQL vs TypeScript ===');

  const filas: any[] = await dbQuery(ds, `
    SELECT v.id AS id, ${canalVentaExpr()} AS canal
    FROM ventas v
    ${joinDeliveryCanal()}
  `, []);
  const canalSql = new Map<number, string>(filas.map((f) => [Number(f.id), String(f.canal)]));

  for (const c of casos) {
    const desdeSql = canalSql.get(c.venta.id);
    ok(desdeSql === c.esperado, `SQL · ${c.nombre} → ${c.esperado}`, desdeSql);

    const entidad = await ds.getRepository(Venta).findOne({
      where: { id: c.venta.id }, relations: ['mesa', 'delivery'],
    });
    const desdeTs = canalDeVenta(entidad);
    ok(desdeTs === c.esperado, `TS  · ${c.nombre} → ${c.esperado}`, desdeTs);
    ok(desdeSql === desdeTs, `SQL y TS coinciden · ${c.nombre}`, { desdeSql, desdeTs });
  }

  console.log('\n[canal-venta] === condicionCanal() filtra el mismo conjunto ===');

  for (const canal of [CanalVenta.SALON, CanalVenta.MOSTRADOR, CanalVenta.DELIVERY, CanalVenta.RETIRO]) {
    const esperados = casos.filter((c) => c.esperado === canal).map((c) => c.venta.id).sort();
    const filtradas: any[] = await dbQuery(ds, `
      SELECT v.id AS id FROM ventas v ${joinDeliveryCanal()} WHERE ${condicionCanal(canal)}
    `, []);
    const obtenidos = filtradas.map((f) => Number(f.id)).sort();
    ok(JSON.stringify(obtenidos) === JSON.stringify(esperados),
      `condicionCanal('${canal}') devuelve las mismas ventas que el CASE`, { obtenidos, esperados });
  }

  // Un canal inventado no puede comportarse como "sin filtro": devolver TODO
  // ante un typo es peor que devolver nada, porque parece que funcionó.
  const conTypo: any[] = await dbQuery(ds, `
    SELECT v.id AS id FROM ventas v ${joinDeliveryCanal()} WHERE ${condicionCanal('DELIVERI')}
  `, []);
  ok(conTypo.length === 0, 'un canal desconocido NO abre el filtro (devuelve vacío)', conTypo.length);
  ok(!esCanalValido('DELIVERI') && esCanalValido('delivery'),
    'esCanalValido: rechaza el typo, acepta minúsculas');

  console.log('\n[canal-venta] === Casos puros del clasificador ===');

  ok(clasificarCanalVenta({ tieneMesa: false, tieneDelivery: true, modoDelivery: null }) === CanalVenta.DELIVERY,
    'delivery sin modo conocido cuenta como DELIVERY (default de la columna)');
  ok(clasificarCanalVenta({ tieneMesa: true }) === CanalVenta.SALON, 'sólo mesa → SALÓN');
  ok(clasificarCanalVenta({ tieneMesa: false }) === CanalVenta.MOSTRADOR, 'ni mesa ni reparto → MOSTRADOR');
  ok(clasificarCanalVenta({ tieneMesa: true, modoDelivery: 'retiro' }) === CanalVenta.RETIRO,
    'el modo se compara sin importar mayúsculas');

  await ds.destroy();

  console.log(`\n[canal-venta] ${passed} OK, ${failed} FALLAN`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
