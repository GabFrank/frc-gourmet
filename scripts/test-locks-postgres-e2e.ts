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
 * El bloque [F] (agregado con el guard de caja cerrada) es el **único gate real
 * del invariante "una sola caja ABIERTO por dispositivo"**: en SQLite hay un
 * solo escritor y el `Promise.all` de `test:caja-apertura` pasaria aunque el
 * indice no existiera. Aca hay dos conexiones y `READ COMMITTED`, que es donde
 * se ve que el `FOR UPDATE` sobre CERO filas NO serializa y que el control
 * primario es el indice unico parcial.
 *
 * ── QUE REVERTIR PARA QUE [F] FALLE ─────────────────────────────────────────
 *  F1 · sacar `CajaUnicaAbiertaPorDispositivo` de `getMigrations()`, o aflojar
 *       `esViolacionCajaUnicaAbierta` a "cualquier 23505" (cae el ultimo assert)
 *  F2 · `guardarAperturaTraduciendoDuplicado` en `create-caja` (sale el
 *       «duplicate key value violates…» crudo), o el indice (ganan las dos)
 *  F3 · el `lock: 'write'` de `update-caja` / el `lock: 'read'` de los escritores
 *  F4 · agregarle `relations` al `findOne` de `leerEstadoCaja` (issue #258)
 *  F5 · mover el `emitCajaCambio` de `update-caja` ADENTRO de la transacción
 *       (hallazgo D1). En SQLite ese assert no discrimina —una sola conexion, la
 *       lectura veria el dato igual—; aca el listener lee desde una SEGUNDA
 *       conexion, asi que si el evento saliera pre-commit leeria ABIERTO
 *  F6 · mover `generarRetiroDelCierre` ADENTRO de la transaccion de `update-caja`
 *       (hallazgo D4 / RB-1): recibe el `DataSource`, o sea OTRA conexion, asi que
 *       no veria el `conteoCierre` sin commitear, devolveria null sin lanzar y el
 *       retiro del cierre dejaria de generarse EN SILENCIO. F6 reproduce el
 *       escenario a mano con dos conexiones (es la premisa); F6b es el que
 *       discrimina el revert, porque va por el handler real
 *  F7 · el `enTransaccionSiPostgres` de `create-gasto-caja` (hallazgos M7/P6): con
 *       el `DataSource` el guard no toma el `FOR SHARE`, lee el ABIERTO sin
 *       commitear del cierre en vuelo y escribe el gasto contra una caja que
 *       queda cerrada un milisegundo despues. Es el TOCTOU de D6, reproducido
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

/** Espera a que `pred` se cumpla, con poll. Devuelve false al vencer el plazo. */
async function esperarA(pred: () => boolean | Promise<boolean>, timeoutMs = 5000, intervaloMs = 25): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (await pred()) return true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return await pred();
}

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

  // ═══════ [F] El invariante de apertura de caja, sobre Postgres real ═══════
  // Este bloque es el ÚNICO gate real del invariante "una sola caja ABIERTO por
  // dispositivo". En SQLite el `Promise.all` no discrimina (un solo escritor);
  // acá hay dos conexiones de verdad y `READ COMMITTED`, que es donde se ve que
  // el `FOR UPDATE` sobre CERO filas NO serializa y que el control primario es
  // el índice único parcial.
  console.log('\n[F] Apertura de caja: una sola ABIERTO por dispositivo');
  {
    const { registerFinancieroHandlers } = require('../electron/handlers/financiero.handler');
    const { invokeHandler } = require('../electron/utils/handler-registry');
    const { withRequestUser } = require('../electron/utils/auth.utils');
    const { esViolacionCajaUnicaAbierta } = require('../electron/utils/caja-abierta.utils');
    const { UQ_CAJAS_ABIERTA_POR_DISPOSITIVO } = require('../src/app/database/indices-opcionales');

    const R = (e: any) => ds.getRepository(e);
    const save = (e: any, data: any) => R(e).save(R(e).create(data as any) as any);
    const { Usuario } = E('personas/usuario.entity');
    const { Permission } = E('personas/permission.entity');
    const { Role } = E('personas/role.entity');
    const { RolePermission } = E('personas/role-permission.entity');
    const { UsuarioRole } = E('personas/usuario-role.entity');
    const { Dispositivo } = E('financiero/dispositivo.entity');
    const { Caja } = E('financiero/caja.entity');
    const { Conteo } = E('financiero/conteo.entity');

    // ── F1: el índice parcial existe en Postgres y muerde ────────────────
    const idx: any[] = await ds.query(
      `SELECT indexname FROM pg_indexes WHERE tablename = 'cajas' AND indexname = $1`,
      [UQ_CAJAS_ABIERTA_POR_DISPOSITIVO],
    );
    ok(idx.length === 1, 'F1: el índice único parcial existe en Postgres', idx);

    const sufijo = Date.now();
    const disp: any = await save(Dispositivo, { nombre: `TERMINAL PG ${sufijo}`, activo: true, isCaja: true });
    const nuevoConteo = async () => await save(Conteo, { activo: true, tipo: 'APERTURA', fecha: new Date() });

    const insertarCaja = async (conteoId: number) => await ds.query(
      `INSERT INTO cajas (created_at, updated_at, dispositivo_id, fecha_apertura,
                          conteo_apertura_id, estado, activo, revisado)
       VALUES (now(), now(), $1, now(), $2, 'ABIERTO', true, false) RETURNING id`,
      [disp.id, conteoId],
    );
    const primera = await insertarCaja((await nuevoConteo()).id);
    ok(primera?.[0]?.id != null, 'F1: la primera caja ABIERTO entra sin problema');

    let errIdx: any = null;
    try { await insertarCaja((await nuevoConteo()).id); } catch (e: any) { errIdx = e; }
    ok(String(errIdx?.code) === '23505', 'F1: el segundo INSERT ABIERTO falla con 23505', errIdx?.message);
    ok(
      esViolacionCajaUnicaAbierta(errIdx),
      'F1: y `esViolacionCajaUnicaAbierta` lo reconoce en el driver `pg`',
      errIdx?.message,
    );
    // Precisión: NO confunde otros únicos de la misma tabla. `conteo_apertura_id`
    // es UNIQUE por el @OneToOne; reusarlo tiene que dar un error distinto, y no
    // «ya hay una caja abierta en esta terminal», que sería mentira.
    const conteoYaUsado: any[] = await ds.query(
      `SELECT conteo_apertura_id AS c FROM cajas WHERE id = $1`, [primera[0].id],
    );
    let errOtro: any = null;
    try {
      await ds.query(
        `INSERT INTO cajas (created_at, updated_at, dispositivo_id, fecha_apertura,
                            conteo_apertura_id, estado, activo, revisado)
         VALUES (now(), now(), $1, now(), $2, 'CERRADO', true, false)`,
        [disp.id, conteoYaUsado[0].c],
      );
    } catch (e: any) { errOtro = e; }
    ok(
      errOtro != null && !esViolacionCajaUnicaAbierta(errOtro),
      'F1: un UNIQUE distinto (conteo_apertura_id) NO se traduce como caja duplicada',
      errOtro?.message,
    );

    // Limpieza para los casos por handler.
    await ds.query(`DELETE FROM cajas WHERE dispositivo_id = $1`, [disp.id]);

    // ── F2: dos `create-caja` concurrentes → uno gana, el otro traducido ──
    // El código del permiso tiene que ser el real (lo compara `ensurePermission`),
    // así que se reusa el existente: la base de locks sobrevive entre corridas.
    const permisos: Record<string, any> = {};
    for (const codigo of ['FINANCIERO_CAJA_OPERAR', 'FINANCIERO_CAJA_VER', 'VENTAS_PDV']) {
      const existente = await R(Permission).findOne({ where: { codigo } as any });
      permisos[codigo] = existente ?? await save(Permission, { codigo, descripcion: codigo, activo: true });
    }
    const usuario: any = await save(Usuario, { nickname: `cajero_pg_${sufijo}`, password: 'x', activo: true });
    const rol: any = await save(Role, { descripcion: `CAJERO PG ${sufijo}`, activo: true });
    for (const c of Object.keys(permisos)) await save(RolePermission, { role: rol, permission: permisos[c] });
    await save(UsuarioRole, { usuario, role: rol });

    registerFinancieroHandlers(ds, () => usuario);

    const abrir = async () => {
      const conteo = await nuevoConteo();
      return await withRequestUser(usuario, () => invokeHandler('create-caja', {
        dispositivo: { id: disp.id },
        conteoApertura: { id: conteo.id },
        fechaApertura: new Date(),
        activo: true,
      }));
    };
    const res = await Promise.allSettled([abrir(), abrir()]);
    const exitos = res.filter((r) => r.status === 'fulfilled').length;
    const traducidos = res.filter(
      (r) => r.status === 'rejected'
        && String((r as any).reason?.message || '').includes('CAJA_ABIERTA_DUPLICADA'),
    ).length;
    ok(exitos === 1, 'F2: exactamente una apertura concurrente gana', exitos);
    ok(traducidos === 1, 'F2: la otra recibe CAJA_ABIERTA_DUPLICADA, no el 23505 crudo', traducidos);
    const crudos = res.filter(
      (r) => r.status === 'rejected'
        && /duplicate key value violates/i.test(String((r as any).reason?.message || '')),
    ).length;
    ok(crudos === 0, 'F2: nunca se filtra «duplicate key value violates unique constraint»', crudos);
    const abiertas: any[] = await ds.query(
      `SELECT id FROM cajas WHERE dispositivo_id = $1 AND estado = 'ABIERTO'`, [disp.id],
    );
    ok(abiertas.length === 1, 'F2: quedó una sola fila ABIERTO', abiertas.length);

    // ── F3: cerrar la caja vs. escribir una venta contra ella ────────────
    // El cierre toma FOR UPDATE sobre la fila; el escritor toma FOR SHARE en el
    // mismo `leerEstadoCaja`. La venta que llega DESPUÉS del commit del cierre
    // no se puede escribir. Se comprueba con dos conexiones de verdad.
    const cajaViva = abiertas[0].id;
    {
      const qrCierre = ds.createQueryRunner();
      await qrCierre.connect();
      await qrCierre.startTransaction();
      await qrCierre.manager.query(`SELECT id FROM cajas WHERE id = $1 FOR UPDATE`, [cajaViva]);

      const qrVenta = ds.createQueryRunner();
      await qrVenta.connect();
      await qrVenta.startTransaction();
      let errEspera = '';
      try {
        await qrVenta.manager.query("SET LOCAL lock_timeout = '400ms'");
        await qrVenta.manager.query(`SELECT id FROM cajas WHERE id = $1 FOR SHARE`, [cajaViva]);
      } catch (e: any) { errEspera = e.message; }
      ok(
        /lock timeout|tiempo de espera/i.test(errEspera),
        'F3: mientras el cierre sostiene FOR UPDATE, el escritor con FOR SHARE espera',
        errEspera || '(no bloqueó)',
      );
      await qrVenta.rollbackTransaction();
      await qrVenta.release();

      // El cierre commitea; la venta que llega después ve CERRADO.
      await qrCierre.manager.query(
        `UPDATE cajas SET estado = 'CERRADO', fecha_cierre = now() WHERE id = $1`, [cajaViva],
      );
      await qrCierre.commitTransaction();
      await qrCierre.release();

      const { leerEstadoCaja } = require('../electron/utils/caja-abierta.utils');
      const estado = await leerEstadoCaja(ds, cajaViva);
      ok(estado?.estado === 'CERRADO', 'F3: tras el commit del cierre, el escritor lee CERRADO', estado);
    }

    // ── F4: el lock del helper no genera FOR SHARE sobre un outer join ───
    // Es el bug #258 aplicado a este helper: `leerEstadoCaja` selecciona
    // columnas escalares y nada más, justamente para poder pedir el lock.
    {
      const { leerEstadoCaja } = require('../electron/utils/caja-abierta.utils');
      let err = '';
      try {
        await ds.transaction(async (m) => {
          await leerEstadoCaja(m, cajaViva, { lock: 'read' });
          await leerEstadoCaja(m, cajaViva, { lock: 'write' });
        });
      } catch (e: any) { err = e.message; }
      ok(err === '', 'F4: leerEstadoCaja con lock no rompe en Postgres (sin outer join)', err || undefined);
      ok(!ERROR_LOCK_JOIN.test(err), 'F4: y no reaparece el error del issue #258', err || undefined);
    }

    // ── F5: `CAJA_CAMBIO` sale DESPUÉS del commit (hallazgo D1) ──────────
    // En SQLite este assert no discrimina: una sola conexión, la lectura vería
    // el dato igual aunque el emit estuviera adentro de la transacción. Acá el
    // listener lee `estado` desde una SEGUNDA conexión física, así que si el
    // evento saliera pre-commit leería todavía ABIERTO.
    const { mesaEvents } = require('../electron/utils/mesa-events.utils');
    const { registerGastosCajaHandlers } = require('../electron/handlers/gastos-caja.handler');
    const { generarRetiroDelCierre } = require('../electron/handlers/retiro-cierre.util');
    const { Moneda } = E('financiero/moneda.entity');
    const { MonedaBillete } = E('financiero/moneda-billete.entity');
    const { FormasPago } = E('compras/forma-pago.entity');
    const { ConteoDetalle } = E('financiero/conteo-detalle.entity');
    const { GastoCaja } = E('financiero/gasto-caja.entity');

    // Fixtures monetarios: la base de locks sobrevive entre corridas, así que
    // se reusan si ya existen.
    const moneda: any = (await R(Moneda).findOne({ where: { denominacion: 'GUARANI' } as any }))
      ?? await save(Moneda, {
        denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
      });
    const billete: any = (await R(MonedaBillete).findOne({ where: { moneda: { id: moneda.id }, valor: 50000 } as any }))
      ?? await save(MonedaBillete, { moneda: { id: moneda.id }, valor: 50000, activo: true });
    const formaPago: any = (await R(FormasPago).findOne({ where: { nombre: 'EFECTIVO' } as any }))
      ?? await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });

    const abrirEn = async (dispositivoId: number) => {
      const conteo = await nuevoConteo();
      return await withRequestUser(usuario, () => invokeHandler('create-caja', {
        dispositivo: { id: dispositivoId },
        conteoApertura: { id: conteo.id },
        fechaApertura: new Date(),
        activo: true,
      }));
    };
    const nuevoConteoCierre = async (cantidad: number) => {
      const c: any = await save(Conteo, { activo: true, tipo: 'CIERRE', fecha: new Date() });
      await save(ConteoDetalle, {
        conteo: { id: c.id }, monedaBillete: { id: billete.id }, cantidad, activo: true,
      });
      return c;
    };
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

    {
      // Conexión aparte para leer desde el listener. Un `QueryRunner` propio es
      // una conexión física distinta del pool: si la transacción del cierre
      // siguiera abierta, este SELECT (sin lock) leería el valor pre-commit.
      const lector = ds.createQueryRunner();
      await lector.connect();

      const leidos: Promise<any>[] = [];
      const eventos: any[] = [];
      const listener = (pl: any) => {
        if (pl?.tipo !== 'CAJA_CAMBIO') return;
        eventos.push(pl);
        leidos.push(
          lector.query(`SELECT estado FROM cajas WHERE id = $1`, [pl.cajaId])
            .then((f: any[]) => f?.[0]?.estado),
        );
      };
      mesaEvents.on('change', listener);
      try {
        const dispF5: any = await save(Dispositivo, { nombre: `TERMINAL PG F5 ${sufijo}`, activo: true, isCaja: true });
        const cajaF5: any = await abrirEn(dispF5.id);
        const conteoF5 = await nuevoConteoCierre(2);
        await withRequestUser(usuario, () => invokeHandler('update-caja', cajaF5.id, {
          estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoF5.id },
        }));
        const limite = Date.now() + 2000;
        while (Date.now() < limite
          && !eventos.some((e) => Number(e.cajaId) === Number(cajaF5.id) && e.cajaEstado === 'CERRADO')) {
          await espera(20);
        }
        ok(
          eventos.some((e) => Number(e.cajaId) === Number(cajaF5.id) && e.cajaEstado === 'CERRADO'),
          'F5: el cierre emite CAJA_CAMBIO con estado CERRADO',
          eventos.map((e) => `${e.cajaId}:${e.cajaEstado}`),
        );
        const estados = await Promise.all(leidos);
        ok(
          estados.length > 0 && estados[estados.length - 1] === 'CERRADO',
          'F5: al emitirse, una SEGUNDA conexión ya veía la caja CERRADO (post-commit de verdad)',
          estados,
        );

        // ── F6: el retiro del cierre no puede ver la transacción sin commitear
        // (hallazgo D4 / RB-1). `generarRetiroDelCierre` recibe el `DataSource`,
        // o sea otra conexión: si se lo llamara DENTRO de la transacción de
        // `update-caja`, no vería el `conteoCierre` y devolvería null SIN LANZAR
        // —el `catch` del handler sólo loguea— y el retiro dejaría de generarse
        // en silencio. Acá se reproduce el escenario exacto con dos conexiones.
        const dispF6: any = await save(Dispositivo, { nombre: `TERMINAL PG F6 ${sufijo}`, activo: true, isCaja: true });
        const cajaF6: any = await abrirEn(dispF6.id);
        const conteoF6 = await nuevoConteoCierre(3);
        {
          const qrCierre = ds.createQueryRunner();
          await qrCierre.connect();
          await qrCierre.startTransaction();
          await qrCierre.manager.query(
            `UPDATE cajas SET estado = 'CERRADO', fecha_cierre = now(), conteo_cierre_id = $2 WHERE id = $1`,
            [cajaF6.id, conteoF6.id],
          );

          // Todavía SIN commitear: desde el DataSource no se ve nada.
          const preCommit = await generarRetiroDelCierre(ds, cajaF6.id, usuario.id);
          ok(
            preCommit == null,
            'F6: con el cierre sin commitear, generarRetiroDelCierre devuelve null (no ve el conteoCierre)',
            preCommit?.id,
          );
          ok(
            Number((await ds.query(
              `SELECT COUNT(*) AS n FROM retiros_caja WHERE caja_id = $1 AND origen = 'CIERRE'`, [cajaF6.id],
            ))[0].n) === 0,
            'F6: y no quedó ningún RetiroCaja de origen CIERRE',
          );

          await qrCierre.commitTransaction();
          await qrCierre.release();
        }
        const postCommit: any = await generarRetiroDelCierre(ds, cajaF6.id, usuario.id);
        ok(postCommit?.id != null, 'F6: después del commit sí lo genera (es el orden real del handler)');
        ok(
          Number((await ds.query(
            `SELECT COUNT(*) AS n FROM retiros_caja WHERE caja_id = $1 AND origen = 'CIERRE'`, [cajaF6.id],
          ))[0].n) === 1,
          'F6: exactamente un RetiroCaja de origen CIERRE',
        );

        // F6b: lo mismo por el HANDLER real, que es lo que discrimina el revert.
        // `test:caja-apertura` [9] ya cubre «cerrar genera el retiro», pero en
        // SQLite eso pasa igual con la llamada adentro de la transacción (una
        // sola conexión). Acá no: si `generarRetiroDelCierre` se moviera
        // adentro, leería desde otra conexión, no vería el `conteoCierre` sin
        // commitear, devolvería null y el `catch` del handler se lo tragaría.
        const dispF6b: any = await save(Dispositivo, { nombre: `TERMINAL PG F6B ${sufijo}`, activo: true, isCaja: true });
        const cajaF6b: any = await abrirEn(dispF6b.id);
        const conteoF6b = await nuevoConteoCierre(4);
        await withRequestUser(usuario, () => invokeHandler('update-caja', cajaF6b.id, {
          estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoF6b.id },
        }));
        const retiroHandler: any[] = await ds.query(
          `SELECT id FROM retiros_caja WHERE caja_id = $1 AND origen = 'CIERRE'`, [cajaF6b.id],
        );
        ok(
          retiroHandler.length === 1,
          'F6b: cerrar por `update-caja` genera el RetiroCaja de origen CIERRE en Postgres',
          retiroHandler.length,
        );
      } finally {
        mesaEvents.off('change', listener);
        await lector.release();
      }
    }

    // ── F7: ajuste de gasto concurrente con un cierre en vuelo (M7/P6/D6) ──
    // El TOCTOU que la auditoría marcó en los canales de ajuste. Con el guard
    // dentro de la transacción, `create-gasto-caja` toma `FOR SHARE` y queda
    // esperando al `FOR UPDATE` del cierre; cuando éste commitea, lee CERRADO y
    // rechaza. Con el guard sobre el `DataSource` (sin transacción y sin lock)
    // leería el ABIERTO todavía vigente y escribiría el gasto contra una caja
    // que se cierra un milisegundo después.
    {
      registerGastosCajaHandlers(ds, () => usuario);
      const dispF7: any = await save(Dispositivo, { nombre: `TERMINAL PG F7 ${sufijo}`, activo: true, isCaja: true });
      const cajaF7: any = await abrirEn(dispF7.id);

      const qrCierre = ds.createQueryRunner();
      await qrCierre.connect();
      await qrCierre.startTransaction();
      await qrCierre.manager.query(`SELECT id FROM cajas WHERE id = $1 FOR UPDATE`, [cajaF7.id]);
      await qrCierre.manager.query(
        `UPDATE cajas SET estado = 'CERRADO', fecha_cierre = now() WHERE id = $1`, [cajaF7.id],
      );

      const pGasto = withRequestUser(usuario, () => invokeHandler('create-gasto-caja', {
        cajaId: cajaF7.id, monto: 50000, descripcion: 'HIELO EN LA CARRERA',
        monedaId: moneda.id, formaPagoId: formaPago.id,
      })).then((v: any) => ({ ok: true, v }), (e: any) => ({ ok: false, e }));

      await espera(400);
      ok(
        Number((await ds.query(
          `SELECT COUNT(*) AS n FROM gastos_caja WHERE caja_id = $1`, [cajaF7.id],
        ))[0].n) === 0,
        'F7: mientras el cierre sostiene el lock, el gasto todavía no escribió nada',
      );

      await qrCierre.commitTransaction();
      await qrCierre.release();

      const res7: any = await pGasto;
      ok(res7.ok === false, 'F7: el gasto concurrente se rechaza', res7.ok ? res7.v?.id : undefined);
      ok(
        String(res7.e?.message || '').includes('CAJA_CERRADA'),
        'F7: y el rechazo es CAJA_CERRADA (el guard leyó el estado ya commiteado)',
        String(res7.e?.message || res7.v?.id),
      );
      ok(
        Number((await ds.query(
          `SELECT COUNT(*) AS n FROM gastos_caja WHERE caja_id = $1`, [cajaF7.id],
        ))[0].n) === 0,
        'F7: no quedó ningún gasto imputado a la caja que se estaba cerrando',
      );
      await ds.query(`DELETE FROM gastos_caja WHERE caja_id = $1`, [cajaF7.id]);
    }

    await ds.query(`DELETE FROM cajas WHERE dispositivo_id = $1`, [disp.id]);
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
