/**
 * E2E sobre POSTGRES REAL: los locks pesimistas no pueden llevar joins.
 *
 * Postgres rechaza `SELECT ... FOR UPDATE` cuando la consulta tiene un LEFT JOIN:
 *
 *   FOR UPDATE no puede ser aplicado al lado nulable de un outer join
 *
 * `findOne({ where, relations, lock })` de TypeORM genera exactamente eso: las
 * `relations` se resuelven con LEFT JOIN. **SQLite ni se entera** — su driver
 * ignora los locks — asi que este error solo aparece en el local del cliente, con
 * un pago ya a medio hacer. Es el bug del issue #258.
 *
 * Este test corre las migraciones sobre un Postgres de verdad y ejercita las
 * consultas con lock del codigo. Si no hay Postgres disponible, se SALTEA.
 *
 * Uso: npm run test:locks-pg
 *   FRC_PG_DATABASE (default frc_gourmet_locktest), FRC_PG_HOST, FRC_PG_PORT,
 *   FRC_PG_USERNAME, FRC_PG_PASSWORD.
 */
import 'reflect-metadata';
import './_electron-mock';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

const ERROR_LOCK_JOIN = /FOR UPDATE.*(outer join|nullable)/i;

async function main() {
  // El override tiene que ir por `getDataSourceOptions`, no por spread: es quien
  // elige el juego de migraciones por driver. Pisando solo `type` se corria el
  // baseline de SQLite contra Postgres.
  const base: any = getDataSourceOptions('.tmp', {
    type: 'postgres',
    host: process.env['FRC_PG_HOST'] || 'localhost',
    port: process.env['FRC_PG_PORT'] ? Number(process.env['FRC_PG_PORT']) : 5432,
    database: process.env['FRC_PG_DATABASE'] || 'frc_gourmet_locktest',
    username: process.env['FRC_PG_USERNAME'] || process.env['USER'] || 'postgres',
    password: process.env['FRC_PG_PASSWORD'] || undefined,
  });
  const ds = new DataSource({ ...base, synchronize: false, migrationsRun: false } as any);

  try {
    await ds.initialize();
  } catch (e: any) {
    console.log(`[locks-pg] SALTEADO: no hay Postgres disponible (${e.message.split('\n')[0]}).`);
    process.exit(0);
  }
  await ds.runMigrations({ transaction: 'each' });
  console.log('[locks-pg] Migraciones OK sobre Postgres.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
  const { Vale } = E('rrhh/vale.entity');
  const { VentaItem } = E('ventas/venta-item.entity');
  const { Venta } = E('ventas/venta.entity');

  // ═══════ [A] La forma que rompia: lock + relations ═══════
  console.log('\n[A] findOne con relations Y lock (la forma del issue #258)');
  {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let err = '';
    try {
      await qr.manager.findOne(Vale, {
        where: { id: 1 },
        relations: ['moneda', 'funcionario', 'funcionario.persona'],
        lock: { mode: 'pessimistic_write' },
      });
    } catch (e: any) { err = e.message; }
    await qr.rollbackTransaction();
    await qr.release();
    ok(ERROR_LOCK_JOIN.test(err),
      'A: Postgres rechaza FOR UPDATE con relations — confirma la causa del issue', err || '(no fallo!)');
  }

  // ═══════ [B] La forma correcta: lock desnudo + carga aparte ═══════
  console.log('\n[B] Lock sobre la fila sola, relaciones en una segunda consulta');
  {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let err = '';
    try {
      await qr.manager.findOne(Vale, { where: { id: 1 }, lock: { mode: 'pessimistic_write' } });
      await qr.manager.findOne(Vale, {
        where: { id: 1 },
        relations: ['moneda', 'funcionario', 'funcionario.persona'],
      });
    } catch (e: any) { err = e.message; }
    await qr.rollbackTransaction();
    await qr.release();
    ok(err === '', 'B: sin joins el FOR UPDATE pasa', err);
  }

  // ═══════ [C] `where` sobre una relacion tambien puede generar join ═══════
  // Lo usa la transferencia del PdV al leer los items de la venta origen.
  console.log('\n[C] find con where sobre una relacion + lock');
  {
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let err = '';
    try {
      await qr.manager.find(VentaItem, {
        where: { venta: { id: 1 }, estado: 'ACTIVO' } as any,
        lock: { mode: 'pessimistic_write' },
      });
    } catch (e: any) { err = e.message; }
    await qr.rollbackTransaction();
    await qr.release();
    ok(err === '', 'C: filtrar por la FK de una relacion no rompe el lock', err || undefined);
  }

  // ═══════ [D] El lock del saldo de Caja Mayor ═══════
  console.log('\n[D] Lock del saldo de Caja Mayor (query builder sin joins)');
  {
    const { CajaMayorSaldo } = E('financiero/caja-mayor-saldo.entity');
    const qr = ds.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    let err = '';
    try {
      await qr.manager.createQueryBuilder(CajaMayorSaldo, 's')
        .setLock('pessimistic_write')
        .where('s.caja_mayor_id = :c AND s.moneda_id = :m AND s.forma_pago_id = :f', { c: 1, m: 1, f: 1 })
        .getOne();
    } catch (e: any) { err = e.message; }
    await qr.rollbackTransaction();
    await qr.release();
    ok(err === '', 'D: el lock de saldo sigue limpio', err || undefined);
  }

  // ═══════ [D2] El lock del delivery serializa de verdad ═══════
  // `delivery-convertir-modo` cambia el modo del pedido y `venta.costo_delivery`
  // a la vez, mientras `actualizar-datos`, `cancelar` y `asignar-repartidor`
  // guardan la entidad ENTERA. Si dos de esos corren a la vez sin serializar,
  // el que llega segundo escribe el modo que leyo antes y despega el modo del
  // envio. El candado es un `SELECT ... FOR UPDATE` a mano justamente porque
  // arriba quedo probado que no puede ir por `findOne({ lock, relations })`.
  console.log('\n[D2] El lock del delivery bloquea a un segundo escritor');
  {
    const filas: any[] = await ds.query(`
      INSERT INTO deliveries
        ("created_at", "updated_at", "nombre", "telefono", "estado", "modo",
         "fecha_abierto", "cobro_anticipado")
      VALUES (now(), now(), 'LOCK TEST', '0981000000', 'ABIERTO', 'DELIVERY', now(), false)
      RETURNING id
    `);
    const deliveryId = Number(filas?.[0]?.id);
    ok(!!deliveryId, 'D2: se pudo crear el delivery de prueba', deliveryId);

    const qrA = ds.createQueryRunner();
    await qrA.connect();
    await qrA.startTransaction();
    let errA = '';
    try {
      // Exactamente la sentencia de `lockDelivery` en delivery.handler.ts.
      await qrA.manager.query('SELECT id FROM deliveries WHERE id = $1 FOR UPDATE', [deliveryId]);
    } catch (e: any) { errA = e.message; }
    ok(errA === '', 'D2: el FOR UPDATE sin joins es valido en Postgres', errA || undefined);

    // Segundo escritor: tiene que QUEDAR BLOQUEADO. Se comprueba con un
    // `lock_timeout` corto — si no bloqueara, la consulta pasaria de largo y el
    // test seria un no-op silencioso, que es justo el error que se quiere
    // evitar acá.
    const qrB = ds.createQueryRunner();
    await qrB.connect();
    await qrB.startTransaction();
    let errB = '';
    try {
      await qrB.manager.query("SET LOCAL lock_timeout = '400ms'");
      await qrB.manager.query('SELECT id FROM deliveries WHERE id = $1 FOR UPDATE', [deliveryId]);
    } catch (e: any) { errB = e.message; }
    ok(/lock timeout|tiempo de espera/i.test(errB),
      'D2: un segundo escritor queda bloqueado mientras el primero no cierra', errB || '(no bloqueo)');

    await qrB.rollbackTransaction();
    await qrB.release();
    await qrA.rollbackTransaction();
    await qrA.release();

    // Liberado el primero, el segundo pasa: el candado no deja nada colgado.
    const qrC = ds.createQueryRunner();
    await qrC.connect();
    await qrC.startTransaction();
    let errC = '';
    try {
      await qrC.manager.query("SET LOCAL lock_timeout = '400ms'");
      await qrC.manager.query('SELECT id FROM deliveries WHERE id = $1 FOR UPDATE', [deliveryId]);
    } catch (e: any) { errC = e.message; }
    ok(errC === '', 'D2: con el primero cerrado, el lock se toma sin esperar', errC || undefined);
    await qrC.rollbackTransaction();
    await qrC.release();

    await ds.query('DELETE FROM deliveries WHERE id = $1', [deliveryId]);
  }

  await ds.destroy();

  // ═══════ [E] Barrido del codigo: ningun lock convive con relations ═══════
  // Los casos de arriba prueban el patron; este busca la forma prohibida en TODO
  // el backend, para que la proxima consulta con lock no repita el issue #258.
  console.log('\n[E] Ningun findOne/find combina lock con relations');
  {
    const fs = require('fs') as typeof import('fs');
    const path = require('path') as typeof import('path');
    const raiz = path.resolve(__dirname, '../electron');

    const archivos: string[] = [];
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(full);
        else if (e.name.endsWith('.ts')) archivos.push(full);
      }
    };
    recorrer(raiz);

    const sospechosos: string[] = [];
    for (const archivo of archivos) {
      const texto = fs.readFileSync(archivo, 'utf8');
      // Objeto de opciones de un find/findOne que menciona `lock:` y `relations`.
      // Se recorta a un objeto por vez para no cruzar dos llamadas distintas.
      const re = /\.(?:findOne|find)\s*\(([\s\S]{0,600}?)\)\s*;/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto)) !== null) {
        const args = m[1];
        if (/\block\s*:/.test(args) && /\brelations\b\s*[:,]/.test(args)) {
          const linea = texto.slice(0, m.index).split('\n').length;
          sospechosos.push(`${path.relative(path.resolve(__dirname, '..'), archivo)}:${linea}`);
        }
      }
    }
    ok(sospechosos.length === 0,
      'E: no hay ninguna consulta que pida lock y relations a la vez', sospechosos);
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} locks-pg: ${passed} pasaron, ${failed} fallaron\n`);
  process.exit(failed === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
