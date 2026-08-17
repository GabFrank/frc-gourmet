/**
 * E2E: observaciones y nota libre de un ítem de venta (PdV).
 *
 * El bug original: al personalizar un ítem con una observación del catálogo
 * ("BUSCAR") **y** una nota escrita a mano, el PdV guardaba DOS filas colgadas
 * de la misma observación — la segunda llevaba la nota adentro. Resultado: la
 * observación aparecía duplicada en pantalla y en la comanda, y la nota no se
 * veía en ningún lado. Y si sólo había nota (sin observación seleccionada), la
 * fila se insertaba con `observacion_id = NULL` contra una columna NOT NULL:
 * explotaba y la nota se perdía en silencio.
 *
 * Valida contra SQLite, ejercitando los handlers reales:
 *  - nota libre sola → se guarda, colgada del sentinel NOTA DEL CLIENTE,
 *  - observación del catálogo + nota → exactamente 2 filas, sin duplicar la
 *    observación, y cada una con su texto,
 *  - varias observaciones + nota → N+1 filas, una sola con nota,
 *  - el texto que arma la comanda muestra la nota (antes leía un campo
 *    inexistente y nunca la imprimía),
 *  - una llamada sin observación y sin nota es rechazada,
 *  - el sentinel se reutiliza (no se crea uno por ítem).
 *
 * Uso: npx ts-node --transpile-only --project tsconfig.typeorm.json scripts/test-observacion-libre-e2e.ts
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { invokeHandlerWithContext } from '../electron/utils/handler-registry';
import { getDataSourceOptions } from '../src/app/database/database.config';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';
import { registerProductosHandlers } from '../electron/handlers/productos.handler';
import { textoObservacionParaTicket } from '../electron/handlers/documentos-tickets.handler';
import { OBSERVACION_NOTA_LIBRE_DESC } from '../electron/utils/observacion-libre.utils';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Lo que ve el cajero en los chips del PdV / el mozo en la comanda. */
function textos(rows: any[]): string[] {
  return rows.map(textoObservacionParaTicket);
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-observacion-libre.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);

  const baseOptions = getDataSourceOptions(tmpDir);
  const ds = new DataSource({ ...(baseOptions as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  await ds.runMigrations({ transaction: 'each' });
  console.log('[observacion-libre] Migraciones OK.');

  const { Usuario } = require('../src/app/database/entities/personas/usuario.entity');
  const { Permission } = require('../src/app/database/entities/personas/permission.entity');
  const { Role } = require('../src/app/database/entities/personas/role.entity');
  const { RolePermission } = require('../src/app/database/entities/personas/role-permission.entity');
  const { UsuarioRole } = require('../src/app/database/entities/personas/usuario-role.entity');
  const { Venta } = require('../src/app/database/entities/ventas/venta.entity');
  const { VentaItem } = require('../src/app/database/entities/ventas/venta-item.entity');
  const { VentaItemObservacion } = require('../src/app/database/entities/ventas/venta-item-observacion.entity');
  const { Observacion } = require('../src/app/database/entities/productos/observacion.entity');

  // Seed: usuario admin con permiso VENTAS_PDV (los handlers lo exigen)
  const admin = await ds.getRepository(Usuario).save(ds.getRepository(Usuario).create({ nickname: 'admin', password: 'x', activo: true } as any));
  const perm = await ds.getRepository(Permission).save(ds.getRepository(Permission).create({ codigo: 'VENTAS_PDV', descripcion: 'PDV', activo: true } as any));
  const role = await ds.getRepository(Role).save(ds.getRepository(Role).create({ descripcion: 'ADMIN', activo: true } as any));
  await ds.getRepository(RolePermission).save(ds.getRepository(RolePermission).create({ role, permission: perm } as any));
  await ds.getRepository(UsuarioRole).save(ds.getRepository(UsuarioRole).create({ usuario: admin, role } as any));

  // Catálogo de observaciones
  const obsRepo = ds.getRepository(Observacion);
  const obsBuscar = await obsRepo.save(obsRepo.create({ descripcion: 'BUSCAR', activo: true } as any));
  const obsSinSal = await obsRepo.save(obsRepo.create({ descripcion: 'SIN SAL', activo: true } as any));

  const venta = await ds.getRepository(Venta).save(ds.getRepository(Venta).create({ estado: 'ABIERTA' } as any));
  const mkItem = () => ds.getRepository(VentaItem).save(ds.getRepository(VentaItem).create({
    venta, precioCostoUnitario: 0, precioVentaUnitario: 10000, cantidad: 1, estado: 'ACTIVO',
  } as any));

  registerVentasHandlers(ds, () => admin);

  // ── Caso 1: SOLO nota libre (antes reventaba contra el NOT NULL) ─────────
  const item1 = await mkItem();
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item1.id },
    observacionLibre: 'que venga bien caliente',
  });
  const rows1 = await invokeHandlerWithContext('getObservacionesByVentaItem', undefined, item1.id);
  ok(rows1.length === 1, 'nota libre sola → 1 fila guardada', rows1.length);
  ok(rows1[0]?.observacionLibre === 'QUE VENGA BIEN CALIENTE', 'la nota se guarda en UPPERCASE', rows1[0]?.observacionLibre);
  ok(rows1[0]?.observacion?.descripcion === OBSERVACION_NOTA_LIBRE_DESC, 'la nota cuelga del sentinel NOTA DEL CLIENTE', rows1[0]?.observacion?.descripcion);
  ok(textos(rows1)[0] === 'QUE VENGA BIEN CALIENTE', 'el ticket/chip muestra el texto, no el nombre del sentinel', textos(rows1));

  // ── Caso 2: observación del catálogo + nota (el caso reportado) ──────────
  const item2 = await mkItem();
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item2.id }, observacion: { id: obsBuscar.id },
  });
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item2.id }, observacionLibre: 'sin picante',
  });
  const rows2 = await invokeHandlerWithContext('getObservacionesByVentaItem', undefined, item2.id);
  ok(rows2.length === 2, 'observación + nota → 2 filas (antes eran 2 pero ambas BUSCAR)', rows2.length);
  const t2 = textos(rows2).sort();
  ok(JSON.stringify(t2) === JSON.stringify(['BUSCAR', 'SIN PICANTE']), 'se ven la observación Y la nota, sin duplicados', t2);
  const conBuscar = rows2.filter((r: any) => r.observacion?.id === obsBuscar.id);
  ok(conBuscar.length === 1, 'la observación del catálogo aparece UNA sola vez', conBuscar.length);
  const conNota = rows2.filter((r: any) => !!r.observacionLibre);
  ok(conNota.length === 1, 'una sola fila lleva la nota', conNota.length);

  // ── Caso 3: varias observaciones + nota → N+1 filas ─────────────────────
  const item3 = await mkItem();
  for (const o of [obsBuscar, obsSinSal]) {
    await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
      ventaItem: { id: item3.id }, observacion: { id: o.id },
    });
  }
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: item3.id }, observacionLibre: 'para llevar',
  });
  const rows3 = await invokeHandlerWithContext('getObservacionesByVentaItem', undefined, item3.id);
  ok(rows3.length === 3, '2 observaciones + nota → 3 filas', rows3.length);
  ok(JSON.stringify(textos(rows3).sort()) === JSON.stringify(['BUSCAR', 'PARA LLEVAR', 'SIN SAL']), 'los 3 textos son distintos', textos(rows3));

  // ── Caso 4: payloads inválidos ──────────────────────────────────────────
  const rechaza = async (payload: any): Promise<boolean> => {
    try { await invokeHandlerWithContext('createVentaItemObservacion', undefined, payload); return false; }
    catch { return true; }
  };
  ok(await rechaza({ ventaItem: { id: item3.id } }), 'sin observación ni nota → error explícito');
  ok(await rechaza({ ventaItem: { id: item3.id }, observacionLibre: '   ' }), 'nota de puros espacios → rechazada');
  ok(
    await rechaza({ ventaItem: { id: item3.id }, observacion: { id: obsBuscar.id }, observacionLibre: 'mezcla' }),
    'observación del catálogo + nota en la misma fila → rechazada (es el bug viejo)',
  );

  // ── Caso 4.b: la nota se corta a 500 (largo de la columna) ──────────────
  const itemLargo = await mkItem();
  await invokeHandlerWithContext('createVentaItemObservacion', undefined, {
    ventaItem: { id: itemLargo.id }, observacionLibre: 'a'.repeat(600),
  });
  const rowsLargo = await invokeHandlerWithContext('getObservacionesByVentaItem', undefined, itemLargo.id);
  ok(rowsLargo[0]?.observacionLibre?.length === 500, 'la nota se corta a 500 caracteres', rowsLargo[0]?.observacionLibre?.length);

  // ── Caso 5: el sentinel se reutiliza, no se crea uno por ítem ───────────
  const sentinels = await obsRepo.find({ where: { descripcion: OBSERVACION_NOTA_LIBRE_DESC } as any });
  ok(sentinels.length === 1, 'existe UN solo sentinel para todas las notas', sentinels.length);

  // ── Caso 5.b: el sentinel NO se ofrece como observación del catálogo ────
  // Si se pudiera vincular a un producto, aparecería como chip elegible en el
  // PdV y el cajero vería el texto interno "NOTA DEL CLIENTE".
  registerProductosHandlers(ds, () => admin);
  const catalogo = await invokeHandlerWithContext('getObservaciones', undefined);
  const enCatalogo = (catalogo || []).some((o: any) => o.descripcion === OBSERVACION_NOTA_LIBRE_DESC);
  ok(!enCatalogo, 'getObservaciones no devuelve el sentinel', (catalogo || []).map((o: any) => o.descripcion));
  ok((catalogo || []).length === 2, 'sí devuelve las observaciones reales', (catalogo || []).length);
  const buscados = await invokeHandlerWithContext('searchObservaciones', undefined, 'NOTA');
  ok(
    !(buscados || []).some((o: any) => o.descripcion === OBSERVACION_NOTA_LIBRE_DESC),
    'searchObservaciones tampoco lo devuelve, ni buscándolo por nombre',
    (buscados || []).map((o: any) => o.descripcion),
  );
  const buscadosSinSal = await invokeHandlerWithContext('searchObservaciones', undefined, 'SAL');
  ok(
    (buscadosSinSal || []).some((o: any) => o.descripcion === 'SIN SAL'),
    'la búsqueda del catálogo sigue funcionando',
    (buscadosSinSal || []).map((o: any) => o.descripcion),
  );

  // ── Caso 6: fila dada de baja no vuelve al re-personalizar ──────────────
  await ds.getRepository(VentaItemObservacion).update({ id: rows1[0].id }, { activo: false } as any);
  const rows1b = await invokeHandlerWithContext('getObservacionesByVentaItem', undefined, item1.id);
  ok(rows1b.length === 0, 'una observación con activo=false no se devuelve', rows1b.length);

  await ds.destroy();
  console.log(`\n[observacion-libre] ${passed} OK, ${failed} FALLARON`);
  // Salida explícita: registerVentasHandlers deja un setInterval (retry comanda).
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
