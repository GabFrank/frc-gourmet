/**
 * Migración TiendaOnlineSeguridad (PLAN-tienda-online F1): up / down / up en SQLite, o en
 * Postgres con TIENDA_PG=<base> (127.0.0.1, PGUSER o postgres). Con TIENDA_PG_VACIAR=1 la
 * base se vacía antes; si no, corre sobre lo que tenga (p. ej. una copia de producción).
 * Uso: npm run test:tienda-online-migracion
 */
import 'reflect-metadata';
import './_electron-mock';
import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { getDataSourceOptions } from '../src/app/database/database.config';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

async function main() {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, 'test-tienda-online-migracion.db');
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  const pgDb = process.env['TIENDA_PG'];
  const ds = pgDb
    ? new DataSource({ ...(getDataSourceOptions(tmpDir, { type: 'postgres', host: process.env['PGHOST'] || '127.0.0.1', database: pgDb, username: process.env['PGUSER'] || 'postgres', password: process.env['PGPASSWORD'] || '' } as any) as any), synchronize: false, migrationsRun: false })
    : new DataSource({ ...(getDataSourceOptions(tmpDir) as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  if (pgDb && process.env['TIENDA_PG_VACIAR'] === '1') { await ds.query('DROP SCHEMA public CASCADE'); await ds.query('CREATE SCHEMA public'); }
  console.log(`[tienda-migracion] ${pgDb ? 'postgres ' + pgDb : 'sqlite'}`);

  const migs = ds.migrations.map((m: any) => m.name || m.constructor.name);
  const nombre = migs.find((n) => /TiendaOnlineSeguridad/.test(n));
  ok(!!nombre, 'la migración está registrada');
  const posteriores = nombre ? migs.length - 1 - migs.indexOf(nombre) : 0;
  const hasta = async () => {
    await ds.runMigrations({ transaction: 'each' });
    for (let i = 0; i < posteriores; i++) await ds.undoLastMigration({ transaction: 'each' });
  };
  // Sube todo y baja las migraciones de la tienda posteriores a F4 (F6 en adelante), para
  // que los bloques F2-F4 de abajo sigan encontrando a F4 como la última.
  const POSTERIORES_A_F4 = /TiendaCategorias|TiendaPersonalizarSabores|TiendaPagoMoneda|TiendaDetallePedido|TiendaTelefonoContactoCuenta|TiendaPagoProveedores|TiendaVinculoCuentaCliente|TiendaPagosMultiIcpay/;
  const subirSinPosteriores = async () => {
    await ds.runMigrations({ transaction: 'each' });
    for (;;) {
      const u = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
      if (!POSTERIORES_A_F4.test(String(u))) break;
      await ds.undoLastMigration({ transaction: 'each' });
    }
  };
  /** Baja migraciones hasta que la última sea la que matchea `re` (la cadena puede crecer). */
  const bajarHasta = async (re: RegExp) => {
    for (let i = 0; i < 20; i++) {
      const u = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
      if (re.test(String(u))) return;
      await ds.undoLastMigration({ transaction: 'each' });
    }
  };
  const columnas = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='pedidos_online'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('pedidos_online')`)).map((r: any) => r.name);
  const indices = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT indexname AS n FROM pg_indexes WHERE tablename='pedidos_online'`)).map((r: any) => r.n)
    : (await ds.query(`SELECT name AS n FROM sqlite_master WHERE type='index' AND tbl_name='pedidos_online'`)).map((r: any) => r.n);

  const antes = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online`).catch(() => [{ n: 0 }]))[0].n);
  await hasta();
  const cols = await columnas();
  ok(cols.includes('idempotency_key'), 'up agrega pedidos_online.idempotency_key');
  const meta = ds.entityMetadatas.find((m) => m.tableName === 'pedidos_online')!;
  // Columnas que agregan migraciones posteriores (F2) no están todavía en este punto.
  const F4_PEDIDO = ['estado_pago', 'pago_proveedor', 'pago_intento', 'pago_idem_key', 'pago_sesion_id', 'pago_checkout_url',
    'pago_id', 'pago_monto', 'pago_expira_en', 'pago_ultima_consulta', 'pago_detalle', 'pagado_en', 'pago_aviso_sin_aceptar'];
  // Columnas de config de migraciones posteriores a F4 (F6b), que estos bloques bajan antes.
  // Columnas de config posteriores a F4 (F6, F8, F9 y proveedores de pago).
  // Varios proveedores + IC Pay (TiendaPagosMultiIcpay).
  const MULTI_PEDIDO = ['pago_datos_json', 'forma_pago_online_id'];
  const MULTI_CFG: string[] = [];
  const PROV_CFG = ['pago_proveedor', 'pago_config_json', 'pago_devolucion_automatica'];
  const POST_F4_CFG = ['personalizar_sabores', 'metodos_pago', 'whatsapp_proveedor', 'telefono_contacto', ...PROV_CFG, ...MULTI_CFG];
  // Columnas de pedido de F8 (TiendaPagoMoneda), posteriores a F4.
  const F8_PEDIDO = ['pago_modalidad', 'pago_moneda_id', 'vuelto_para', 'pago_cotizacion', 'pago_observacion'];
  // Columnas de pedido y config de F9 (TiendaDetallePedido).
  const F9_PEDIDO = ['cancelacion_solicitada_en', 'cancelacion_motivo', 'cancelacion_respuesta'];
  const F9_CFG = ['whatsapp_proveedor', 'telefono_contacto'];
  const F4_CFG = ['pago_online_activo', 'upay_base_url', 'upay_merchant_id', 'upay_merchant_nombre', 'minutos_aviso_pagado_sin_aceptar'];
  // F8b fase 1 (TiendaVinculoCuentaCliente): cliente del pedido y quién vinculó la cuenta.
  const VINC_PEDIDO = ['cliente_id'];
  const VINC_CUENTA = ['vinculado_por', 'vinculado_en'];
  const POSTERIORES = ['seguimiento_token_hash', ...F4_PEDIDO, ...F8_PEDIDO, ...F9_PEDIDO, ...VINC_PEDIDO, ...MULTI_PEDIDO];
  const entTodas = meta.columns.map((c) => c.databaseName).sort();
  const ent = entTodas.filter((c) => !POSTERIORES.includes(c));
  ok(JSON.stringify(ent) === JSON.stringify([...cols].sort()), 'las columnas coinciden con la entidad', [ent, cols]);
  const idx = await indices();
  ok(['UQ_pedidos_online_cuenta_idem', 'UQ_pedidos_online_mesa_idem', 'IDX_pedidos_online_cuenta_cliente'].every((n) => idx.includes(n)), 'up crea los 3 índices', idx);
  const despuesUp = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online`))[0].n);
  ok(despuesUp === antes, 'no toca los pedidos existentes', [antes, despuesUp]);
  const sinClave = Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online WHERE idempotency_key IS NOT NULL`))[0].n);
  ok(sinClave === 0, 'los existentes quedan sin clave (sin backfill)');

  const ins = (num: string, cuenta: number | null, mesa: number | null, key: string | null) =>
    ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, cuenta_cliente_id, mesa_id, idempotency_key) VALUES ('${num}', 'PICKUP', ${cuenta ?? 'NULL'}, ${mesa ?? 'NULL'}, ${key ? `'${key}'` : 'NULL'})`);
  const falla = async (fn: () => Promise<any>) => { try { await fn(); return false; } catch { return true; } };
  await ins('ZT-1', 900001, null, 'k-1');
  ok(await falla(() => ins('ZT-2', 900001, null, 'k-1')), 'misma cuenta + misma clave → rechazado');
  ok(!(await falla(() => ins('ZT-3', 900002, null, 'k-1'))), 'otra cuenta + misma clave → permitido');
  await ins('ZT-4', null, 900001, 'k-2');
  ok(await falla(() => ins('ZT-5', null, 900001, 'k-2')), 'misma mesa (invitado) + misma clave → rechazado');
  ok(!(await falla(() => ins('ZT-6', null, 900002, 'k-2'))), 'otra mesa + misma clave → permitido');
  ok(!(await falla(() => ins('ZT-7', 900003, null, null))) && !(await falla(() => ins('ZT-8', 900003, null, null))), 'sin clave no aplica unicidad');
  await ds.query(`DELETE FROM pedidos_online WHERE numero LIKE 'ZT-%'`);

  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('idempotency_key'), 'down quita la columna');
  ok(!(await indices()).some((n) => /idem|IDX_pedidos_online_cuenta_cliente/.test(n)), 'down quita los índices');
  await hasta();
  ok((await columnas()).includes('idempotency_key'), 'up de nuevo la vuelve a crear');

  // F2: TiendaSeguimientoMesa (columna del hash de seguimiento + índice), up / down / up.
  // Se sube todo y se bajan F4 y F3 para que F2 quede última.
  await subirSinPosteriores();
  await ds.undoLastMigration({ transaction: 'each' });
  await ds.undoLastMigration({ transaction: 'each' });
  const ultima = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaSeguimientoMesa/.test(String(ultima)), 'F2: TiendaSeguimientoMesa es la última migración', ultima);
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up agrega pedidos_online.seguimiento_token_hash');
  ok((await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 up crea el índice de seguimiento');
  ok((await columnas()).includes('idempotency_key'), 'F2 no toca idempotency_key');
  ok(JSON.stringify(entTodas.filter((c) => !F4_PEDIDO.includes(c) && !F8_PEDIDO.includes(c) && !F9_PEDIDO.includes(c) && !VINC_PEDIDO.includes(c) && !MULTI_PEDIDO.includes(c))) === JSON.stringify([...(await columnas())].sort()), 'F2: las columnas coinciden con la entidad (sin F4, F8 ni F9)');
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('seguimiento_token_hash'), 'F2 down quita la columna');
  ok(!(await indices()).some((n) => /IDX_pedidos_online_seguimiento/.test(n)), 'F2 down quita el índice');
  await subirSinPosteriores();
  ok((await columnas()).includes('seguimiento_token_hash'), 'F2 up de nuevo la vuelve a crear');

  // F3: TiendaIngresoClientes (4 columnas nullable en tienda_online_config), up / down / up.
  const colsCfg = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='tienda_online_config'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('tienda_online_config')`)).map((r: any) => r.name);
  const F3_COLS = ['whatsapp_phone_number_id', 'whatsapp_plantilla', 'whatsapp_idioma', 'google_client_id'];
  await ds.undoLastMigration({ transaction: 'each' }); // baja F4 para que F3 quede última
  const ultimaF3 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaIngresoClientes/.test(String(ultimaF3)), 'F3: TiendaIngresoClientes es la última migración', ultimaF3);
  const cfgCols = await colsCfg();
  ok(F3_COLS.every((c) => cfgCols.includes(c)), 'F3 up agrega las 4 columnas', cfgCols);
  const metaCfg = ds.entityMetadatas.find((m) => m.tableName === 'tienda_online_config')!;
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).filter((c) => !F4_CFG.includes(c) && !POST_F4_CFG.includes(c)).sort()) === JSON.stringify([...cfgCols].sort()), 'F3: las columnas coinciden con la entidad (sin F4)');
  await ds.query(`DELETE FROM tienda_online_config`);
  await ds.query(`INSERT INTO tienda_online_config (nombre_comercio, google_client_id) VALUES ('ZT-CFG', 'x.apps.googleusercontent.com')`);
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF3 = await colsCfg();
  ok(!F3_COLS.some((c) => sinF3.includes(c)), 'F3 down quita las 4 columnas', sinF3);
  const fila = await ds.query(`SELECT nombre_comercio FROM tienda_online_config`);
  ok(fila.length === 1 && fila[0].nombre_comercio === 'ZT-CFG', 'F3 down conserva la fila de config', fila);
  await subirSinPosteriores();
  ok((await colsCfg()).includes('google_client_id'), 'F3 up de nuevo las vuelve a crear');
  await ds.query(`DELETE FROM tienda_online_config WHERE nombre_comercio = 'ZT-CFG'`);

  // F4: TiendaPagoOnline, up / down / up y down bloqueado con pagos registrados.
  const ultimaF4 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaPagoOnline/.test(String(ultimaF4)), 'F4: TiendaPagoOnline es la última migración', ultimaF4);
  const colsF4 = await columnas();
  ok(F4_PEDIDO.every((c) => colsF4.includes(c)), 'F4 up agrega las columnas de pago al pedido');
  ok(JSON.stringify(entTodas.filter((c) => !F8_PEDIDO.includes(c) && !F9_PEDIDO.includes(c) && !VINC_PEDIDO.includes(c) && !MULTI_PEDIDO.includes(c))) === JSON.stringify([...colsF4].sort()), 'F4: las columnas del pedido coinciden con la entidad (sin F8 ni F9)');
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).filter((c) => !POST_F4_CFG.includes(c)).sort()) === JSON.stringify([...(await colsCfg())].sort()), 'F4: las columnas de config coinciden con la entidad');
  ok((await indices()).includes('UQ_pedidos_online_pago_id'), 'F4 crea el índice único de pago_id');
  const actCfg = await ds.query(`SELECT pago_online_activo AS a FROM tienda_online_config`);
  ok(actCfg.every((r: any) => !r.a || r.a === '0'), 'F4: pago online queda apagado en las configs existentes', actCfg);
  await ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, pago_proveedor, pago_id) VALUES ('ZT-P1', 'PICKUP', 'UPAY', 'pay-1')`);
  ok(await falla(() => ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, pago_proveedor, pago_id) VALUES ('ZT-P2', 'PICKUP', 'UPAY', 'pay-1')`)), 'F4: un mismo pago no confirma dos pedidos');
  ok(await falla(() => ds.undoLastMigration({ transaction: 'each' })), 'F4 down aborta si hay un pago registrado');
  ok((await columnas()).includes('pago_id'), 'F4: tras el abort las columnas siguen');
  await ds.query(`DELETE FROM pedidos_online WHERE numero LIKE 'ZT-P%'`);
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF4 = await columnas();
  const sinF4Cfg = await colsCfg();
  ok(!F4_PEDIDO.some((c) => sinF4.includes(c)) && !F4_CFG.some((c) => sinF4Cfg.includes(c)), 'F4 down sin pagos quita las columnas');
  const tablas = pgDb
    ? (await ds.query(`SELECT tablename AS t FROM pg_tables WHERE schemaname='public'`)).map((r: any) => r.t)
    : (await ds.query(`SELECT name AS t FROM sqlite_master WHERE type='table'`)).map((r: any) => r.t);
  ok(!tablas.includes('pagos_online_eventos'), 'F4 down quita la tabla de eventos');
  await ds.runMigrations({ transaction: 'each' });
  ok((await columnas()).includes('pago_id'), 'F4 up de nuevo las vuelve a crear');

  // F8: TiendaPagoMoneda (cómo paga el cliente + métodos de la tienda), up / down / up.
  await bajarHasta(/TiendaPagoMoneda/); // baja lo posterior a F8 para que quede última
  const ultimaF8 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaPagoMoneda/.test(String(ultimaF8)), 'F8: TiendaPagoMoneda es la última migración', ultimaF8);
  const colsF8 = await columnas();
  ok(JSON.stringify(entTodas.filter((c) => !F9_PEDIDO.includes(c) && !VINC_PEDIDO.includes(c) && !MULTI_PEDIDO.includes(c))) === JSON.stringify([...colsF8].sort()), 'F8: las columnas del pedido coinciden con la entidad (sin F9)');
  ok((await colsCfg()).includes('metodos_pago'), 'F8 up agrega metodos_pago a la config');
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF8 = await columnas();
  ok(!F8_PEDIDO.some((c) => sinF8.includes(c)) && !(await colsCfg()).includes('metodos_pago'), 'F8 down las quita');
  await ds.runMigrations({ transaction: 'each' });
  const conF8 = await columnas();
  ok(F8_PEDIDO.every((c) => conF8.includes(c)), 'F8 up de nuevo las vuelve a crear');
  await bajarHasta(/TiendaDetallePedido/); // baja lo posterior: F9 queda última

  // F9: TiendaDetallePedido (solicitud de cancelación + proveedor de WhatsApp + teléfono), up / down / up.
  const ultimaF9 = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaDetallePedido/.test(String(ultimaF9)), 'F9: TiendaDetallePedido es la última migración', ultimaF9);
  ok(JSON.stringify(entTodas.filter((c) => !VINC_PEDIDO.includes(c) && !MULTI_PEDIDO.includes(c))) === JSON.stringify([...(await columnas())].sort()), 'F9: las columnas del pedido coinciden con la entidad (sin el vínculo F8b)');
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).filter((c) => !PROV_CFG.includes(c) && !MULTI_CFG.includes(c)).sort()) === JSON.stringify([...(await colsCfg())].sort()), 'F9: las columnas de config coinciden con la entidad (sin proveedores de pago)');
  await ds.query(`INSERT INTO pedidos_online (numero, tipo_pedido, cancelacion_motivo) VALUES ('ZT-F9', 'PICKUP', 'X')`);
  await ds.undoLastMigration({ transaction: 'each' });
  const sinF9 = await columnas();
  const sinF9Cfg = await colsCfg();
  ok(!F9_PEDIDO.some((c) => sinF9.includes(c)) && !F9_CFG.some((c) => sinF9Cfg.includes(c)), 'F9 down las quita');
  ok(Number((await ds.query(`SELECT COUNT(*) AS n FROM pedidos_online WHERE numero = 'ZT-F9'`))[0].n) === 1, 'F9 down conserva los pedidos');
  await ds.runMigrations({ transaction: 'each' });
  const conF9 = await columnas();
  const conF9Cfg = await colsCfg();
  ok(F9_PEDIDO.every((c) => conF9.includes(c)) && F9_CFG.every((c) => conF9Cfg.includes(c)), 'F9 up de nuevo las vuelve a crear');
  await ds.query(`DELETE FROM pedidos_online WHERE numero = 'ZT-F9'`);

  // Teléfono de contacto de la cuenta (TiendaTelefonoContactoCuenta), up / down / up.
  const colsCuenta = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='cuentas_cliente'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('cuentas_cliente')`)).map((r: any) => r.name);
  await bajarHasta(/TiendaTelefonoContactoCuenta/);
  const ultimaTel = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaTelefonoContactoCuenta/.test(String(ultimaTel)), 'Contacto: TiendaTelefonoContactoCuenta es la última migración', ultimaTel);
  const metaCuenta = ds.entityMetadatas.find((m) => m.tableName === 'cuentas_cliente')!;
  ok(JSON.stringify(metaCuenta.columns.map((c) => c.databaseName).filter((c) => !VINC_CUENTA.includes(c)).sort()) === JSON.stringify([...(await colsCuenta())].sort()),
    'Contacto: las columnas de la cuenta coinciden con la entidad (sin el vínculo F8b)');
  await ds.query(`INSERT INTO cuentas_cliente (email, telefono_contacto, activo, telefono_verificado, email_verificado) VALUES ('zt-tel@x.com', '0981000111', ${pgDb ? 'true, false, false' : '1, 0, 0'})`);
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await colsCuenta()).includes('telefono_contacto'), 'Contacto: down quita la columna');
  ok(Number((await ds.query(`SELECT COUNT(*) AS n FROM cuentas_cliente WHERE email = 'zt-tel@x.com'`))[0].n) === 1, 'Contacto: down conserva las cuentas');
  await ds.runMigrations({ transaction: 'each' });
  ok((await colsCuenta()).includes('telefono_contacto'), 'Contacto: up de nuevo la vuelve a crear');
  await ds.query(`DELETE FROM cuentas_cliente WHERE email = 'zt-tel@x.com'`);

  // Proveedores de pago (TiendaPagoProveedores): 3 columnas de config + forma de pago BANCARD ONLINE.
  await bajarHasta(/TiendaPagoProveedores/);
  const ultimaProv = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaPagoProveedores/.test(String(ultimaProv)), 'Proveedores: TiendaPagoProveedores es la última migración', ultimaProv);
  const PROV_COLS = ['pago_proveedor', 'pago_config_json', 'pago_devolucion_automatica'];
  const conProv = await colsCfg();
  ok(PROV_COLS.every((c) => metaCfg.columns.some((m) => m.databaseName === c) && conProv.includes(c)),
    'Proveedores: las 3 columnas están en la entidad y en la base', conProv);
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).filter((c) => !MULTI_CFG.includes(c)).sort()) === JSON.stringify([...(await colsCfg())].sort()),
    'Proveedores: las columnas de config coinciden con la entidad (sin la lista de proveedores)');
  const fpB = async () => Number((await ds.query(`SELECT COUNT(*) AS n FROM formas_pago WHERE nombre = 'BANCARD ONLINE'`))[0].n);
  ok(await fpB() === 1, 'Proveedores: siembra la forma de pago BANCARD ONLINE');
  await ds.undoLastMigration({ transaction: 'each' });
  const sinProv = await colsCfg();
  ok(!sinProv.some((c) => PROV_COLS.includes(c)), 'Proveedores: down quita las columnas', sinProv);
  ok(await fpB() === 0, 'Proveedores: down quita la forma de pago sin usar');
  await ds.runMigrations({ transaction: 'each' });
  const deNuevo = await colsCfg();
  ok(PROV_COLS.every((c) => deNuevo.includes(c)) && await fpB() === 1, 'Proveedores: up de nuevo las vuelve a crear');

  // F8b fase 1 (TiendaVinculoCuentaCliente): vínculo cuenta ↔ cliente, historial, cliente del pedido.
  await bajarHasta(/TiendaVinculoCuentaCliente/);
  const ultimaVinc = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaVinculoCuentaCliente/.test(String(ultimaVinc)), 'Vínculo: TiendaVinculoCuentaCliente es la última migración', ultimaVinc);
  ok(JSON.stringify(entTodas.filter((c) => !MULTI_PEDIDO.includes(c))) === JSON.stringify([...(await columnas())].sort()), 'Vínculo: las columnas del pedido coinciden con la entidad (sin los datos del proveedor)');
  ok(JSON.stringify(metaCuenta.columns.map((c) => c.databaseName).sort()) === JSON.stringify([...(await colsCuenta())].sort()),
    'Vínculo: las columnas de la cuenta coinciden con la entidad completa');
  const tablaVinc = async () => Number((await ds.query(pgDb
    ? `SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema='public' AND table_name='cuentas_cliente_vinculos'`
    : `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='cuentas_cliente_vinculos'`))[0].n);
  ok(await tablaVinc() === 1, 'Vínculo: crea la tabla de historial');
  const metaVinc = ds.entityMetadatas.find((m) => m.tableName === 'cuentas_cliente_vinculos')!;
  const colsVinc = pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='cuentas_cliente_vinculos'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('cuentas_cliente_vinculos')`)).map((r: any) => r.name);
  ok(JSON.stringify(metaVinc.columns.map((c) => c.databaseName).sort()) === JSON.stringify([...colsVinc].sort()), 'Vínculo: el historial coincide con su entidad', colsVinc);
  const B = pgDb ? ['true', 'false'] : ['1', '0'];
  const cuentaCon = (email: string, cli: number | null) => ds.query(`INSERT INTO cuentas_cliente (email, cliente_id, activo, telefono_verificado, email_verificado) VALUES ('${email}', ${cli ?? 'NULL'}, ${B[0]}, ${B[1]}, ${B[1]})`);
  await cuentaCon('zt-v1@x.com', 777001);
  ok(await falla(() => cuentaCon('zt-v2@x.com', 777001)), 'Vínculo: dos cuentas con el mismo cliente → rechazado');
  await cuentaCon('zt-v3@x.com', null);
  await cuentaCon('zt-v4@x.com', null);
  ok(Number((await ds.query(`SELECT COUNT(*) AS n FROM cuentas_cliente WHERE email LIKE 'zt-v%'`))[0].n) === 3, 'Vínculo: muchas cuentas sin cliente sí');
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('cliente_id') && await tablaVinc() === 0, 'Vínculo: down quita la columna del pedido y la tabla');
  const sinVincCuenta = await colsCuenta();
  ok(!VINC_CUENTA.some((c) => sinVincCuenta.includes(c)) && sinVincCuenta.includes('cliente_id'), 'Vínculo: down quita quién/cuándo y deja el cliente_id original de la cuenta');
  ok(Number((await ds.query(`SELECT COUNT(*) AS n FROM cuentas_cliente WHERE email LIKE 'zt-v%'`))[0].n) === 3, 'Vínculo: down conserva las cuentas');
  await ds.runMigrations({ transaction: 'each' });
  ok((await columnas()).includes('cliente_id') && await tablaVinc() === 1, 'Vínculo: up de nuevo vuelve a crear todo');
  await ds.query(`DELETE FROM cuentas_cliente WHERE email LIKE 'zt-v%'`);

  // Formas de pago online + IC Pay (TiendaPagosMultiIcpay): tabla de cuentas, cuenta y datos del
  // cobro en el pedido, PIX ONLINE, y la conversión del proveedor elegido en la primera cuenta.
  const ultimaMulti = (await ds.query(`SELECT name FROM typeorm_migrations ORDER BY id DESC LIMIT 1`))[0]?.name;
  ok(/TiendaPagosMultiIcpay/.test(String(ultimaMulti)), 'Multi: TiendaPagosMultiIcpay es la última migración', ultimaMulti);
  ok(JSON.stringify(entTodas) === JSON.stringify([...(await columnas())].sort()), 'Multi: las columnas del pedido coinciden con la entidad completa');
  ok(JSON.stringify(metaCfg.columns.map((c) => c.databaseName).sort()) === JSON.stringify([...(await colsCfg())].sort()), 'Multi: las columnas de config coinciden con la entidad completa');
  const metaFormas = ds.entityMetadatas.find((m) => m.tableName === 'formas_pago_online')!;
  const colsFormas = async (): Promise<string[]> => pgDb
    ? (await ds.query(`SELECT column_name AS c FROM information_schema.columns WHERE table_schema='public' AND table_name='formas_pago_online'`)).map((r: any) => r.c)
    : (await ds.query(`PRAGMA table_info('formas_pago_online')`)).map((r: any) => r.name);
  ok(JSON.stringify(metaFormas.columns.map((c) => c.databaseName).sort()) === JSON.stringify([...(await colsFormas())].sort()), 'Multi: formas_pago_online coincide con su entidad', await colsFormas());
  const fpPix = async () => Number((await ds.query(`SELECT COUNT(*) AS n FROM formas_pago WHERE nombre = 'PIX ONLINE'`))[0].n);
  ok(await fpPix() === 1, 'Multi: siembra la forma de pago PIX ONLINE');
  const nFormas = async () => Number((await ds.query(`SELECT COUNT(*) AS n FROM formas_pago_online`))[0].n);
  ok(await nFormas() === 0, 'Multi: sin proveedor elegido no crea cuentas (la tienda sigue como antes)');
  await ds.undoLastMigration({ transaction: 'each' });
  ok(!(await columnas()).includes('pago_datos_json') && !(await columnas()).includes('forma_pago_online_id') && !(await colsFormas()).length && await fpPix() === 0,
    'Multi: down quita la tabla, las columnas y la forma de pago sin usar');
  // Conversión: con un proveedor elegido y sus datos, al subir queda como la primera cuenta.
  const convJson = '{"ICPAY":{"baseUrl":"https://stage.api.ic.com.py","email":"x@y.com"},"BANCARD":{"entorno":"PRUEBA"}}';
  if (Number((await ds.query(`SELECT COUNT(*) AS n FROM tienda_online_config`))[0].n)) {
    await ds.query(`UPDATE tienda_online_config SET pago_proveedor = 'ICPAY', pago_config_json = '${convJson}'`);
  } else {
    await ds.query(`INSERT INTO tienda_online_config (activa, pago_proveedor, pago_config_json) VALUES (${pgDb ? 'true' : '1'}, 'ICPAY', '${convJson}')`);
  }
  await ds.runMigrations({ transaction: 'each' });
  const conv = await ds.query(`SELECT proveedor, nombre, activo, orden, config_json FROM formas_pago_online`);
  const cj = JSON.parse(conv[0]?.config_json || '{}');
  ok(conv.length === 1 && conv[0].proveedor === 'ICPAY' && conv[0].nombre === 'PIX (BRASIL)' && !!conv[0].activo && Number(conv[0].orden) === 1
    && cj.baseUrl === 'https://stage.api.ic.com.py' && cj.email === 'x@y.com' && cj._legado === '1',
    'Multi: el proveedor elegido pasa a ser la primera cuenta, con sus datos y marcada _legado', conv);
  ok((await columnas()).includes('forma_pago_online_id') && await fpPix() === 1, 'Multi: up de nuevo vuelve a crear todo');
  await ds.query(`DELETE FROM formas_pago_online`);
  await ds.query(`UPDATE tienda_online_config SET pago_proveedor = NULL, pago_config_json = NULL`);

  await ds.destroy();
  console.log(`\n[tienda-migracion] ${passed} OK, ${failed} fallas`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
