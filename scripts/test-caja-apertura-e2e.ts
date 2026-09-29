/**
 * E2E: una sola caja `ABIERTO` por dispositivo, y cerrar una caja ya cerrada
 * falla con un mensaje que se entiende.
 *
 * La otra mitad del incidente del 24/09. La apertura era check-then-act puro
 * (`repo.count()` + `repo.save()` FUERA de transacción en `create-caja`,
 * `findOne()` + `save()` en `abrir-caja-desde-conteo`) y el guard sólo corría
 * `if (data.estado === 'ABIERTO')` — omitir el campo lo saltaba entero, porque
 * la entidad tiene `default: ABIERTO`. Y `update-caja` aceptaba CERRADO →
 * CERRADO sin fallar ni dejar rastro (causa D): el diálogo "completaba" el
 * cierre de una caja cerrada sin escribir nada.
 *
 * ── QUÉ REVERTIR PARA QUE CADA BLOQUE FALLE ────────────────────────────────
 *  [1] el índice existe ........... sacar `CajaUnicaAbiertaPorDispositivo` de
 *                                   `getMigrations()` en `database.config.ts`
 *  [2] INSERT crudo duplicado ..... ídem — este bloque prueba el ÍNDICE, no el
 *                                   guard: escribe por SQL, sin pasar por
 *                                   ningún handler. Los dos últimos asserts
 *                                   caen si se afloja `esViolacionCajaUnica-
 *                                   Abierta` a "cualquier UNIQUE de SQLite"
 *  [3] create-caja duplicada ...... el `cajaAbiertaDeDispositivo` de
 *                                   `create-caja` (con el índice puesto, el
 *                                   rechazo pasa a venir de la traducción);
 *                                   el assert "SIN `estado`" cae al volver el
 *                                   guard a `data.estado === ABIERTO` en vez
 *                                   de `data.estado ?? ABIERTO`
 *  [4] abrir-caja-desde-conteo .... su guard / el índice
 *  [5] traducción del error ....... `guardarAperturaTraduciendoDuplicado`
 *                                   (sin ella sale `SQLITE_CONSTRAINT …` crudo)
 *  [6] dos CERRADAS conviven ...... hacer el índice total en vez de parcial
 *                                   (sacarle el `WHERE "estado" = 'ABIERTO'`)
 *  [7] update-caja CERRADO→CERRADO  la regla 1 de D7 en `update-caja`; y el
 *                                   assert del orden cae si el
 *                                   `ensurePermission('…AJUSTAR')` corre ANTES
 *                                   del rechazo (el cajero vería «PERMISO
 *                                   REQUERIDO» en vez del mensaje que explica)
 *  [8] update sobre CERRADO ....... la regla 2 (permiso de ajuste)
 *  [9] retiro del cierre (RB-1) ... mover `generarRetiroDelCierre` DENTRO de la
 *                                   transacción de `update-caja`
 * [10] Promise.all ................ `withAperturaCajaLock` en `create-caja`
 * [11] migración con duplicados ... cambiar el `return` del pre-chequeo por un
 *                                   throw: la migración abortaría el arranque
 * [12] asegurarIndicesOpcionales .. su llamada en `database.service.ts`, o el
 *                                   pre-chequeo de duplicados del util
 * [14] caja abierta del usuario .. el `order: { fechaApertura: DESC, id: DESC }`
 *                                   de `get-caja-abierta-by-usuario` (D8): sin
 *                                   él vuelve la caja de ayer, que es cómo el
 *                                   PdV queda pegado a la caja equivocada
 * [13] CAJA_CAMBIO ............... los `emitCajaCambio` de `create-caja`,
 *                                   `update-caja`, `finalizar-ajuste-caja` y
 *                                   `abrir-caja-desde-conteo`. Los asserts de
 *                                   "no se emite" caen si el emisor se mueve
 *                                   ADENTRO de la transacción
 * [15] campos no editables (P2) ... el destructuring que saca `id`,
 *                                   `createdBy`, `createdAt`, `dispositivo`,
 *                                   `conteoApertura` y `fechaApertura` del
 *                                   payload de `update-caja` antes del merge.
 *                                   El sub-assert del cierre cae con sólo
 *                                   volver a aceptar `createdBy`
 * [16] sin reapertura (P3) ........ la regla 1b de `update-caja`
 *                                   (CERRADO → ABIERTO)
 * [17] create-caja sólo ABIERTO ... el rechazo de `estadoFinal !== ABIERTO`
 *                                   en `create-caja` (P9)
 * [18] cierre vs. venta (M5) ...... NO discrimina por sí solo (ver el aviso
 *                                   del bloque): es el humo de no-regresión de
 *                                   haber sacado la transacción del cierre en
 *                                   SQLite. Cae si el cierre deja de generar
 *                                   el retiro o si la venta concurrente se
 *                                   pierde
 * [20] tx compartida en SQLite .... nada del PR: MIDE el mecanismo que
 *                                   justifica `enTransaccionSiPostgres` y
 *                                   `withAperturaCajaLock`. Si algún día
 *                                   TypeORM/sqlite3 dejan de compartir la
 *                                   transacción física, este bloque falla y
 *                                   hay que revisar las dos decisiones
 * [19] duplicados con NULL (M9) ... el `AND dispositivo_id IS NOT NULL` del
 *                                   pre-chequeo de la migración y de
 *                                   `dispositivosConCajasDuplicadas`
 *
 * ⚠️ **El caso [10] NO es el criterio de aceptación de la concurrencia.** En
 * SQLite el `Promise.all` no prueba que el invariante resista una carrera: la
 * carrera real —y el único gate— vive en `npm run test:locks-pg`. Lo que [10]
 * sí cubre, y no es poco, se descubrió midiendo: **en SQLite dos
 * `dataSource.transaction()` intercalados comparten la MISMA transacción
 * física**, así que el ROLLBACK de la apertura perdedora borraba el INSERT de
 * la ganadora — un doble click dejaba CERO cajas abiertas y el mensaje «ya hay
 * una caja abierta», que encima era falso. Ese es el assert "quedó una sola
 * fila ABIERTO", y lo sostiene `withAperturaCajaLock`.
 *
 * ⚠️ **El caso [9] no discrimina el ALCANCE de la transacción en SQLite**: el
 * driver usa una sola conexión, así que `generarRetiroDelCierre` vería los
 * datos aunque corriera antes del commit. Acá lo que se fija es que cerrar una
 * caja SIGUE generando el `RetiroCaja` de origen `CIERRE` — la regresión más
 * probable de todo el PR. Lo que distingue "dentro vs. fuera de la
 * transacción" es de Postgres.
 *
 * ⚠️ El cache de permisos es por usuario con TTL de 30 s. Los asserts de
 * permiso usan DOS USUARIOS DISTINTOS (cajero sin `FINANCIERO_CAJA_AJUSTAR`,
 * gerente con él) y `withRequestUser`, que es el camino real de `/api/rpc`.
 *
 * Uso: npm run test:caja-apertura
 */
import 'reflect-metadata';
import './_electron-mock';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { getDataSourceOptions } from '../src/app/database/database.config';
import {
  asegurarIndicesOpcionales,
  dispositivosConCajasDuplicadas,
  UQ_CAJAS_ABIERTA_POR_DISPOSITIVO,
} from '../src/app/database/indices-opcionales';
// D12: el nombre viene del módulo de la migración. Estaba hardcodeado en el
// `DELETE FROM typeorm_migrations` de [11]; si el timestamp cambiaba, el DELETE
// no matcheaba, la migración no se reejecutaba y el bloque quedaba tautológico
// (pasaba sin ejercitar el pre-chequeo).
import { NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA } from '../src/app/database/migrations/1790617935368-CajaUnicaAbiertaPorDispositivo';
import { invokeHandler } from '../electron/utils/handler-registry';
import {
  esViolacionCajaUnicaAbierta,
  guardarAperturaTraduciendoDuplicado,
} from '../electron/utils/caja-abierta.utils';
import { withRequestUser } from '../electron/utils/auth.utils';
import { mesaEvents } from '../electron/utils/mesa-events.utils';
import { registerFinancieroHandlers } from '../electron/handlers/financiero.handler';
import { registerCajaMayorHandlers } from '../electron/handlers/caja-mayor.handler';
import { registerVentasHandlers } from '../electron/handlers/ventas.handler';

let passed = 0, failed = 0;
function ok(cond: boolean, name: string, extra?: any) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}`, extra !== undefined ? JSON.stringify(extra) : ''); }
}

/** Invoca esperando que RECHACE con `codigo` en el mensaje. */
async function rechaza(codigo: string, nombre: string, fn: () => Promise<any>) {
  try {
    await fn();
    ok(false, nombre, 'no lanzó');
  } catch (e: any) {
    ok(String(e?.message || e).includes(codigo), nombre, String(e?.message || e));
  }
}

/** Invoca esperando que FUNCIONE. */
async function permite(nombre: string, fn: () => Promise<any>): Promise<any> {
  try {
    const r = await fn();
    ok(true, nombre);
    return r;
  } catch (e: any) {
    ok(false, nombre, String(e?.message || e));
    return null;
  }
}

const CAJA_CERRADA = 'CAJA_CERRADA';
const DUPLICADA = 'CAJA_ABIERTA_DUPLICADA';

/**
 * Espera a que `pred` se cumpla, con poll (hallazgo D9).
 *
 * Reemplaza a los `setTimeout(50)` fijos: en una máquina cargada 50 ms no
 * alcanzan y el test se pone flaky justo en los asserts del evento. Devuelve
 * `false` al vencer el plazo en vez de lanzar, para que el `ok()` de abajo
 * muestre el assert real y no un timeout.
 */
async function esperarA(pred: () => boolean, timeoutMs = 2000, intervaloMs = 20): Promise<boolean> {
  const limite = Date.now() + timeoutMs;
  while (Date.now() < limite) {
    if (pred()) return true;
    await new Promise((r) => setTimeout(r, intervaloMs));
  }
  return pred();
}

/**
 * Pausa corta para los asserts NEGATIVOS («no se emitió nada»), que por
 * definición no se pueden esperar por poll: hay que darle una ventana al
 * emisor y comprobar que no la usó.
 */
const reposo = () => new Promise((r) => setTimeout(r, 80));

/** ¿Existe el índice parcial en esta base SQLite? */
async function existeIndice(ds: DataSource): Promise<boolean> {
  const filas: any[] = await ds.query(`PRAGMA index_list('cajas')`);
  return (filas || []).some((f: any) => String(f.name) === UQ_CAJAS_ABIERTA_POR_DISPOSITIVO);
}

function nuevaDb(nombre: string): string {
  const tmpDir = path.resolve(__dirname, '../.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const dbFile = path.join(tmpDir, nombre);
  if (fs.existsSync(dbFile)) fs.unlinkSync(dbFile);
  return dbFile;
}

async function abrirDs(dbFile: string): Promise<DataSource> {
  const base = getDataSourceOptions(path.dirname(dbFile));
  const ds = new DataSource({ ...(base as any), database: dbFile, synchronize: false, migrationsRun: false });
  await ds.initialize();
  return ds;
}

async function main() {
  const dbFile = nuevaDb('test-caja-apertura.db');
  const ds = await abrirDs(dbFile);
  await ds.runMigrations({ transaction: 'each' });
  console.log('[caja-apertura] Migraciones OK.');

  const E = (p: string) => require(`../src/app/database/entities/${p}`);
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
  const { ConteoDetalle } = E('financiero/conteo-detalle.entity');
  const { Moneda } = E('financiero/moneda.entity');
  const { MonedaBillete } = E('financiero/moneda-billete.entity');
  const { FormasPago } = E('compras/forma-pago.entity');
  const { RetiroCaja } = E('financiero/retiro-caja.entity');

  // ── Usuarios: dos distintos por el cache de permisos ─────────────────────
  const permisos: Record<string, any> = {};
  for (const codigo of [
    'FINANCIERO_CAJA_OPERAR', 'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER',
    'FINANCIERO_CAJA_AJUSTAR', 'CAJA_MAYOR_OPERAR', 'VENTAS_PDV',
  ]) {
    permisos[codigo] = await save(Permission, { codigo, descripcion: codigo, activo: true });
  }
  const conRol = async (nickname: string, codigos: string[]) => {
    const u: any = await save(Usuario, { nickname, password: 'x', activo: true });
    const rol: any = await save(Role, { descripcion: nickname.toUpperCase(), activo: true });
    for (const c of codigos) await save(RolePermission, { role: rol, permission: permisos[c] });
    await save(UsuarioRole, { usuario: u, role: rol });
    return u;
  };
  const cajero: any = await conRol('cajero', [
    'FINANCIERO_CAJA_OPERAR', 'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER', 'CAJA_MAYOR_OPERAR',
    'VENTAS_PDV',
  ]);
  const gerente: any = await conRol('gerente', [
    'FINANCIERO_CAJA_OPERAR', 'FINANCIERO_CAJA_GESTIONAR', 'FINANCIERO_CAJA_VER',
    'FINANCIERO_CAJA_AJUSTAR', 'CAJA_MAYOR_OPERAR',
  ]);
  /** Ejecuta `fn` como `usuario`, por el mismo camino que usa `/api/rpc`. */
  const como = <T>(usuario: any, fn: () => Promise<T>): Promise<T> =>
    Promise.resolve(withRequestUser(usuario, fn) as Promise<T>);

  // ── Datos base ───────────────────────────────────────────────────────────
  const terminal: any = await save(Dispositivo, { nombre: 'TERMINAL PRINCIPAL', activo: true, isCaja: true });
  const tablet: any = await save(Dispositivo, { nombre: 'TABLET MOZO', activo: true, isCaja: true });
  const gs: any = await save(Moneda, {
    denominacion: 'GUARANI', simbolo: 'Gs', principal: true, activo: true, decimales: 0, countryCode: 'PY',
  });
  const billete50k: any = await save(MonedaBillete, { moneda: { id: gs.id }, valor: 50000, activo: true });
  await save(FormasPago, { nombre: 'EFECTIVO', activo: true, principal: true, movimentaCaja: true });

  registerFinancieroHandlers(ds, () => cajero);
  registerCajaMayorHandlers(ds, () => cajero);
  // Sólo para el humo [18] (cierre vs. venta): `update-caja` y `createVenta`
  // son los dos canales que en SQLite compartían la transacción física.
  registerVentasHandlers(ds, () => cajero);

  const nuevoConteo = async (tipo: 'APERTURA' | 'CIERRE'): Promise<any> =>
    await save(Conteo, { activo: true, tipo, fecha: new Date() });

  /** Abre una caja por el handler real. */
  const abrirCaja = (dispositivoId: number, conEstado = true) => {
    return (async () => {
      const conteo = await nuevoConteo('APERTURA');
      return await invokeHandler('create-caja', {
        dispositivo: { id: dispositivoId },
        conteoApertura: { id: conteo.id },
        fechaApertura: new Date(),
        activo: true,
        ...(conEstado ? { estado: 'ABIERTO' } : {}),
      });
    })();
  };

  // ── 1 · El índice existe tras correr las migraciones ─────────────────────
  console.log('\n[1] El índice único parcial se creó con las migraciones');
  ok(await existeIndice(ds), `existe "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}" en cajas`);

  // ── 2 · El índice muerde: INSERT crudo, sin pasar por el handler ─────────
  // Este bloque prueba el ÍNDICE, no el guard: es el control primario, y en
  // Postgres es lo ÚNICO que cierra la carrera de doble apertura (el FOR UPDATE
  // sobre cero filas no serializa en READ COMMITTED).
  console.log('\n[2] El índice rechaza un segundo ABIERTO escrito por SQL crudo');
  const cajaBase: any = await permite('primera caja de la terminal (handler real)',
    () => abrirCaja(terminal.id));
  {
    const conteo = await nuevoConteo('APERTURA');
    let err = '';
    try {
      await ds.query(
        `INSERT INTO cajas (created_at, updated_at, dispositivo_id, fecha_apertura,
                            conteo_apertura_id, estado, activo, revisado)
         VALUES (datetime('now'), datetime('now'), ?, datetime('now'), ?, 'ABIERTO', 1, 0)`,
        [terminal.id, conteo.id],
      );
    } catch (e: any) { err = String(e?.message || e); }
    ok(/UNIQUE constraint failed/i.test(err), 'el INSERT directo viola el índice único', err || '(no falló!)');
    // ⚠️ SQLite nombra la COLUMNA, no el índice (`cajas.dispositivo_id`);
    // Postgres nombra el índice. `esViolacionCajaUnicaAbierta` mira las dos
    // formas, y a propósito NO acepta "cualquier UNIQUE": `cajas` tiene además
    // el único de `conteo_apertura_id` por el @OneToOne.
    ok(
      /UNIQUE constraint failed:[^\n]*\bcajas\.dispositivo_id\b/i.test(err),
      'el mensaje de SQLite nombra cajas.dispositivo_id (lo que el matcher detecta)', err,
    );
    ok(
      esViolacionCajaUnicaAbierta({ code: 'SQLITE_CONSTRAINT', message: err }),
      'el matcher lo reconoce…',
    );
    ok(
      !esViolacionCajaUnicaAbierta({
        code: 'SQLITE_CONSTRAINT',
        message: 'SQLITE_CONSTRAINT: UNIQUE constraint failed: cajas.conteo_apertura_id',
      }),
      '…y NO confunde el único de conteo_apertura_id con una caja duplicada',
    );

    // La TRADUCCIÓN, sin pasar por el guard. En SQLite el guard + el candado
    // atajan todos los caminos por handler, así que sin este assert la
    // traducción quedaría sin cobertura local: sólo la ejercitaría
    // `test:locks-pg`, que en esta máquina se saltea.
    const conteoTrad = await nuevoConteo('APERTURA');
    let msgTrad = '';
    try {
      await guardarAperturaTraduciendoDuplicado(
        () => R(Caja).save(R(Caja).create({
          estado: 'ABIERTO', activo: true, fechaApertura: new Date(),
          conteoApertura: { id: conteoTrad.id }, dispositivo: { id: terminal.id },
        } as any) as any),
        terminal.id,
        ds,
      );
    } catch (e: any) { msgTrad = String(e?.message || e); }
    ok(msgTrad.startsWith(`${DUPLICADA}:`), 'la violación del índice se traduce a CAJA_ABIERTA_DUPLICADA', msgTrad);
    ok(!/SQLITE_CONSTRAINT/.test(msgTrad), 'y el error crudo del driver no llega al usuario', msgTrad);
    ok(msgTrad.includes(`#${cajaBase.id}`), 'el mensaje nombra la caja que ya estaba abierta', msgTrad);
  }

  // ── 3 · create-caja: segunda apertura en la misma terminal ───────────────
  console.log('\n[3] create-caja · segunda caja en el mismo dispositivo');
  await rechaza(DUPLICADA, 'la segunda apertura secuencial se rechaza',
    () => abrirCaja(terminal.id));
  await rechaza(DUPLICADA, `el mensaje lleva el código ${DUPLICADA}, no el error crudo del driver`,
    () => abrirCaja(terminal.id));
  // [3b] El agujero real: sin `estado` en el payload la entidad abre igual
  // (`default: ABIERTO`), y el guard viejo ni se enteraba.
  await rechaza(DUPLICADA, 'SIN `estado` en el payload también se rechaza',
    () => abrirCaja(terminal.id, false));
  ok(
    (await R(Caja).count({ where: { dispositivo: { id: terminal.id }, estado: 'ABIERTO' } as any })) === 1,
    'sigue habiendo exactamente UNA caja ABIERTO en la terminal',
  );
  await permite('otro dispositivo sí puede abrir la suya', () => abrirCaja(tablet.id));

  // ── 4 · abrir-caja-desde-conteo ──────────────────────────────────────────
  console.log('\n[4] abrir-caja-desde-conteo · dispositivo ya ocupado');
  {
    const conteo = await nuevoConteo('APERTURA');
    await rechaza(DUPLICADA, 'abrir desde conteo sobre un dispositivo ocupado se rechaza',
      () => invokeHandler('abrir-caja-desde-conteo', conteo.id, terminal.id));
    ok(
      (await R(Caja).count({ where: { conteoApertura: { id: conteo.id } } as any })) === 0,
      'no quedó ninguna caja a medio crear con ese conteo',
    );
  }

  // ── 5 · El error traducido es el mismo para los dos caminos ──────────────
  console.log('\n[5] El mensaje es humano y el mismo en los dos canales');
  {
    let m1 = '', m2 = '';
    try { await abrirCaja(terminal.id); } catch (e: any) { m1 = String(e?.message || e); }
    const conteo = await nuevoConteo('APERTURA');
    try { await invokeHandler('abrir-caja-desde-conteo', conteo.id, terminal.id); }
    catch (e: any) { m2 = String(e?.message || e); }
    ok(m1.startsWith(`${DUPLICADA}:`), 'create-caja: prefijo del código', m1);
    ok(/Ya hay una caja abierta en esta terminal/.test(m1), 'create-caja: texto en español', m1);
    ok(/Ya hay una caja abierta en esta terminal/.test(m2), 'abrir-desde-conteo: mismo texto', m2);
    ok(!/SQLITE_CONSTRAINT|duplicate key/i.test(m1 + m2), 'nunca se filtra el error crudo del driver');
  }

  // ── 6 · El índice es PARCIAL: dos cerradas conviven ──────────────────────
  console.log('\n[6] Dos cajas CERRADAS en el mismo dispositivo conviven');
  {
    await R(Caja).update(cajaBase.id, { estado: 'CERRADO', fechaCierre: new Date() } as any);
    const c2: any = await permite('se puede abrir otra caja tras cerrar la anterior',
      () => abrirCaja(terminal.id));
    await R(Caja).update(c2.id, { estado: 'CERRADO', fechaCierre: new Date() } as any);
    ok(
      (await R(Caja).count({ where: { dispositivo: { id: terminal.id }, estado: 'CERRADO' } as any })) === 2,
      'quedaron dos CERRADAS en la misma terminal sin violar el índice',
    );
  }

  // ── 7 · update-caja: CERRADO → CERRADO (causa D del incidente) ───────────
  console.log('\n[7] update-caja · cerrar una caja ya cerrada');
  {
    const caja: any = await abrirCaja(terminal.id);
    const conteoCierre = await nuevoConteo('CIERRE');
    await save(ConteoDetalle, {
      conteo: { id: conteoCierre.id }, monedaBillete: { id: billete50k.id }, cantidad: 3, activo: true,
    });
    await permite('el primer cierre funciona',
      () => invokeHandler('update-caja', caja.id, {
        estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoCierre.id },
      }));

    // Regla 1 de D7. Antes esto devolvía la caja sin error y sin escribir nada.
    await rechaza(CAJA_CERRADA, 'cerrarla otra vez falla con CAJA_CERRADA',
      () => invokeHandler('update-caja', caja.id, { estado: 'CERRADO', fechaCierre: new Date() }));

    // ── Orden de las reglas (D7): el cajero NO tiene FINANCIERO_CAJA_AJUSTAR.
    // Si la regla 2 corriera primero vería «PERMISO REQUERIDO: …AJUSTAR», que
    // lo mandaría a pedir un permiso que no necesita.
    let msg = '';
    try {
      await como(cajero, () => invokeHandler('update-caja', caja.id, { estado: 'CERRADO' }));
    } catch (e: any) { msg = String(e?.message || e); }
    ok(msg.includes(CAJA_CERRADA), 'el cajero ve CAJA_CERRADA…', msg);
    ok(!msg.includes('PERMISO REQUERIDO'), '…y NO «PERMISO REQUERIDO: FINANCIERO_CAJA_AJUSTAR»', msg);
    ok(/ya fue cerrada el \d{2}\/\d{2}\/\d{4}/.test(msg), 'el mensaje dice cuándo se cerró', msg);

    // ── 8 · Regla 2: cualquier update sobre una caja CERRADO es un ajuste ──
    console.log('\n[8] update-caja · sobre caja CERRADO exige FINANCIERO_CAJA_AJUSTAR');
    const conteoAjuste = await nuevoConteo('CIERRE');
    await rechaza('FINANCIERO_CAJA_AJUSTAR', 'sin el permiso, el update sobre la caja cerrada se rechaza',
      () => como(cajero, () => invokeHandler('update-caja', caja.id, {
        conteoCierre: { id: conteoAjuste.id }, fechaCierre: new Date(),
      })));
    await permite('con FINANCIERO_CAJA_AJUSTAR y SIN `estado`, el ajuste pasa',
      () => como(gerente, () => invokeHandler('update-caja', caja.id, {
        conteoCierre: { id: conteoAjuste.id }, fechaCierre: new Date(),
      })));
    const ajustada: any = await R(Caja).findOne({
      where: { id: caja.id }, relations: ['conteoCierre'],
    });
    ok(ajustada?.conteoCierre?.id === conteoAjuste.id, 'el conteo de cierre quedó reemplazado por el del ajuste');
    ok(ajustada?.estado === 'CERRADO', 'y la caja sigue CERRADO (el ajuste no la reabre)');

    // Ni siquiera el gerente puede "re-cerrarla": la regla 1 va primero.
    await rechaza(CAJA_CERRADA, 'el gerente tampoco puede volver a cerrarla (regla 1 antes que la 2)',
      () => como(gerente, () => invokeHandler('update-caja', caja.id, { estado: 'CERRADO' })));
  }

  // ── 9 · RB-1: cerrar sigue generando el RetiroCaja de origen CIERRE ──────
  // La regresión más probable del PR: `update-caja` pasó a ser transaccional y
  // `generarRetiroDelCierre` recibe el DataSource, no el manager. Si quedara
  // DENTRO de la transacción, en Postgres leería el estado pre-commit, no
  // encontraría el `conteoCierre`, devolvería null SIN LANZAR (el catch del
  // handler sólo loguea) y el retiro dejaría de generarse en silencio.
  console.log('\n[9] RB-1 · cerrar una caja genera el RetiroCaja origen CIERRE');
  {
    // La tablet ya tiene su caja abierta desde el bloque [3]: se cierra esa.
    const cajaCierre: any = await R(Caja).findOne({
      where: { dispositivo: { id: tablet.id }, estado: 'ABIERTO' } as any, order: { id: 'DESC' },
    });
    ok(cajaCierre != null, 'la tablet tiene su caja abierta para cerrar');
    const conteoCierre = await nuevoConteo('CIERRE');
    await save(ConteoDetalle, {
      conteo: { id: conteoCierre.id }, monedaBillete: { id: billete50k.id }, cantidad: 4, activo: true,
    });
    await permite('la caja se cierra',
      () => invokeHandler('update-caja', cajaCierre.id, {
        estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoCierre.id },
      }));
    const retiro: any = await R(RetiroCaja).findOne({
      where: { caja: { id: cajaCierre.id }, origen: 'CIERRE' } as any,
      relations: ['detalles', 'conteoCierre'],
      order: { id: 'DESC' },
    });
    ok(retiro != null, 'se generó el RetiroCaja de origen CIERRE');
    ok(retiro?.estado === 'FLOTANTE', 'queda FLOTANTE, listo para ingresar a Caja Mayor', retiro?.estado);
    ok(retiro?.conteoCierre?.id === conteoCierre.id, 'apunta al conteo de cierre de esta caja');
    ok(
      Number(retiro?.detalles?.[0]?.monto) === 4 * 50000,
      'el monto del retiro sale del conteo de cierre (4 × 50.000)',
      retiro?.detalles?.map((d: any) => Number(d.monto)),
    );
  }

  // ── 10 · Humo: Promise.all en SQLite (NO es criterio de aceptación) ──────
  // Lo que SÍ cubre acá: que el candado `withAperturaCajaLock` impida que dos
  // `dataSource.transaction()` se intercalen. Sin él, en SQLite comparten la
  // transacción física y el ROLLBACK de la perdedora borra el INSERT de la
  // ganadora: quedaban CERO cajas abiertas y el cajero veía «ya hay una caja
  // abierta». Verificado midiendo, no razonando.
  console.log('\n[10] Humo · dos create-caja en paralelo (la carrera real es de Postgres)');
  {
    const disp: any = await save(Dispositivo, { nombre: 'TERMINAL HUMO', activo: true, isCaja: true });
    const resultados = await Promise.allSettled([abrirCaja(disp.id), abrirCaja(disp.id)]);
    const exitos = resultados.filter((r) => r.status === 'fulfilled').length;
    const rechazos = resultados.filter(
      (r) => r.status === 'rejected' && String((r as any).reason?.message || '').includes(DUPLICADA),
    ).length;
    ok(exitos === 1, 'exactamente una apertura ganó', exitos);
    ok(rechazos === 1, `la otra fue rechazada con ${DUPLICADA}`, rechazos);
    const abiertas = await R(Caja).count({
      where: { dispositivo: { id: disp.id }, estado: 'ABIERTO' } as any,
    });
    ok(abiertas === 1, 'quedó una sola fila ABIERTO en la base', abiertas);
  }

  // ── 13 · CAJA_CAMBIO: el aviso que hace que el PdV suelte la caja ────────
  // Sin este evento el PdV sólo se enteraba al recuperar el foco o al operar.
  // Los dos asserts que importan: (a) se emite DESPUÉS del commit —cuando el
  // listener corre, la base ya dice CERRADO, así que el cliente que revalida
  // con `get-caja` no lee el estado viejo—, y (b) NO se emite si la
  // transacción falla, o el PdV soltaría una caja que sigue abierta.
  //
  // ⚠️ En SQLite el "después del commit" no es discriminante (una sola
  // conexión: la lectura vería el dato igual). Lo que acá se fija es que el
  // evento sale, con qué payload, y que un rechazo no lo emite.
  console.log('\n[13] CAJA_CAMBIO · se emite tras el commit, y no se emite si la tx falla');
  {
    const eventos: any[] = [];
    const estadoAlEmitir: Promise<any>[] = [];
    const listener = (p: any) => {
      if (p?.tipo !== 'CAJA_CAMBIO') return;
      eventos.push(p);
      // Se lee la base DENTRO del listener: si el emisor estuviera adentro de
      // la transacción, acá se vería el estado previo.
      estadoAlEmitir.push(
        ds.query(`SELECT estado FROM cajas WHERE id = ?`, [p.cajaId]).then((f: any[]) => f?.[0]?.estado),
      );
    };
    mesaEvents.on('change', listener);
    try {
      const dispEv: any = await save(Dispositivo, { nombre: 'TERMINAL EVENTOS', activo: true, isCaja: true });

      // (a) apertura
      const cajaEv: any = await permite('se abre una caja para escuchar su ciclo',
        () => abrirCaja(dispEv.id));
      await esperarA(() => eventos.some((e) => e.cajaId === cajaEv.id && e.cajaEstado === 'ABIERTO'));
      const abre = eventos.find((e) => e.cajaId === cajaEv.id && e.cajaEstado === 'ABIERTO');
      ok(abre != null, 'create-caja emite CAJA_CAMBIO con estado ABIERTO');
      ok(Number(abre?.dispositivoId) === Number(dispEv.id), 'el payload lleva el dispositivo dueño', abre?.dispositivoId);
      ok(typeof abre?.seq === 'number' && abre.seq > 0, 'seq es un number (Date.now(), `cajas` no tiene columna seq)', abre?.seq);

      // (b) la tx falla → no se emite nada
      const antes = eventos.length;
      await rechaza(DUPLICADA, 'la segunda apertura en la misma terminal se rechaza',
        () => abrirCaja(dispEv.id));
      await reposo();
      ok(eventos.length === antes, 'una apertura rechazada NO emite CAJA_CAMBIO', eventos.length - antes);

      // (c) cierre: emite CERRADO y la base ya lo dice
      const conteoEv = await nuevoConteo('CIERRE');
      await save(ConteoDetalle, {
        conteo: { id: conteoEv.id }, monedaBillete: { id: billete50k.id }, cantidad: 1, activo: true,
      });
      await permite('la caja se cierra',
        () => invokeHandler('update-caja', cajaEv.id, {
          estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoEv.id },
        }));
      await esperarA(() => eventos.some((e) => e.cajaId === cajaEv.id && e.cajaEstado === 'CERRADO'));
      const cierra = eventos.filter((e) => e.cajaId === cajaEv.id && e.cajaEstado === 'CERRADO');
      ok(cierra.length === 1, 'update-caja cerrando emite UN CAJA_CAMBIO con estado CERRADO', cierra.length);
      const estados = await Promise.all(estadoAlEmitir);
      ok(
        estados[estados.length - 1] === 'CERRADO',
        'al emitirse, la base ya tenía la caja CERRADO (el evento va después del commit)',
        estados[estados.length - 1],
      );

      // (d) un update-caja rechazado (cerrar dos veces) no emite
      const antesDelRechazo = eventos.length;
      await rechaza(CAJA_CERRADA, 'cerrarla de nuevo se rechaza',
        () => invokeHandler('update-caja', cajaEv.id, { estado: 'CERRADO' }));
      await reposo();
      ok(eventos.length === antesDelRechazo, 'un update-caja rechazado NO emite CAJA_CAMBIO',
        eventos.length - antesDelRechazo);

      // (e) finalizar-ajuste-caja también avisa (A13): hace `save` directo y
      // cambia `revisado`/`motivoAjuste` de una caja que el PdV puede mirar.
      const antesAjuste = eventos.length;
      await permite('finalizar-ajuste-caja pasa con el permiso de ajuste',
        () => como(gerente, () => invokeHandler('finalizar-ajuste-caja', cajaEv.id, 'PRUEBA DE EVENTO')));
      await esperarA(() => eventos.length > antesAjuste);
      ok(eventos.length > antesAjuste, 'finalizar-ajuste-caja emite CAJA_CAMBIO');

      // (f) abrir-caja-desde-conteo, el otro canal de apertura
      const conteoAp = await nuevoConteo('APERTURA');
      const antesConteo = eventos.length;
      const desdeConteo: any = await permite('abrir-caja-desde-conteo funciona con la terminal libre',
        () => como(gerente, () => invokeHandler('abrir-caja-desde-conteo', conteoAp.id, dispEv.id)));
      await esperarA(() => eventos.slice(antesConteo).some((e) => e.cajaId === desdeConteo?.id && e.cajaEstado === 'ABIERTO'));
      ok(
        eventos.slice(antesConteo).some((e) => e.cajaId === desdeConteo?.id && e.cajaEstado === 'ABIERTO'),
        'abrir-caja-desde-conteo emite CAJA_CAMBIO con estado ABIERTO',
      );
    } finally {
      mesaEvents.off('change', listener);
    }
  }

  // ── 14 · get-caja-abierta-by-usuario: la MÁS RECIENTE (D8) ───────────────
  // El PdV usa este canal para recargar la caja que acaba de abrir
  // (`pdv.component.ts:372-374`). La unicidad que garantiza este PR es por
  // DISPOSITIVO, no por usuario: un encargado que abre la caja de la barra y la
  // del salón tiene dos abiertas, y un `findOne` sin `order` le devuelve una
  // cualquiera — quedarse pegado a la caja equivocada es exactamente el bug.
  console.log('\n[14] get-caja-abierta-by-usuario · devuelve la más reciente');
  {
    const dispA: any = await save(Dispositivo, { nombre: 'TERMINAL BARRA', activo: true, isCaja: true });
    const dispB: any = await save(Dispositivo, { nombre: 'TERMINAL SALON', activo: true, isCaja: true });
    const abrirCon = async (dispositivoId: number, fechaApertura: Date) => {
      const conteo = await nuevoConteo('APERTURA');
      return await invokeHandler('create-caja', {
        dispositivo: { id: dispositivoId }, conteoApertura: { id: conteo.id },
        fechaApertura, activo: true, estado: 'ABIERTO',
      });
    };
    // La VIEJA se crea primero (id menor): sin el `order`, el findOne la
    // devuelve a ella, que es justo la que el cajero ya no está usando. Las dos
    // fechas se adelantan sobre el reloj para que sean las MÁS RECIENTES de la
    // base (los bloques anteriores dejaron cajas abiertas con `fechaApertura`
    // = ahora; con fechas fijas el assert mediría eso y no el `order`).
    const vieja: any = await abrirCon(dispA.id, new Date(Date.now() + 60 * 60 * 1000));
    const nueva: any = await abrirCon(dispB.id, new Date(Date.now() + 2 * 60 * 60 * 1000));
    ok(Number(vieja?.id) < Number(nueva?.id), 'la caja anterior tiene el id menor (es la que ganaría sin `order`)');

    const resuelta: any = await invokeHandler('get-caja-abierta-by-usuario', cajero.id);
    ok(
      Number(resuelta?.id) === Number(nueva.id),
      'devuelve la caja abierta MÁS RECIENTE del usuario, no una cualquiera',
      { resuelta: resuelta?.id, esperada: nueva.id, descartada: vieja?.id },
    );
  }

  // ── 15 · update-caja NO acepta campos no editables (P2) ──────────────────
  // El merge era ciego salvo por `dispositivo`. El camino que importa:
  // `createdBy` es el abridor y el guard «solo el usuario que abrió la caja
  // puede cerrarla» se evalúa contra él, así que aceptarlo del payload dejaba
  // que cualquiera con FINANCIERO_CAJA_OPERAR se apropiara de la caja con un
  // update y después la cerrara.
  console.log('\n[15] update-caja · campos no editables (P2)');
  {
    const dispP2: any = await save(Dispositivo, { nombre: 'TERMINAL P2', activo: true, isCaja: true });
    const dispAjeno: any = await save(Dispositivo, { nombre: 'TERMINAL P2 AJENA', activo: true, isCaja: true });
    // La abre el CAJERO (es quien devuelve `getCurrentUser` por defecto).
    const caja: any = await permite('el cajero abre la caja de la prueba', () => abrirCaja(dispP2.id));
    const antes: any = await R(Caja).findOne({ where: { id: caja.id }, relations: ['createdBy', 'dispositivo', 'conteoApertura'] });
    const conteoAjeno = await nuevoConteo('APERTURA');

    // Un campo por llamada: así, al revertir el strip de UNO solo, cae su
    // assert y no el del vecino.
    const intentar = (payload: any) => como(gerente, () => invokeHandler('update-caja', caja.id, payload));
    await permite('update con `createdBy` no falla (se ignora en silencio)',
      () => intentar({ createdBy: { id: gerente.id } }));
    await permite('update con `dispositivo` tampoco', () => intentar({ dispositivo: { id: dispAjeno.id } }));
    await permite('update con `conteoApertura` tampoco', () => intentar({ conteoApertura: { id: conteoAjeno.id } }));
    await permite('update con `fechaApertura` tampoco', () => intentar({ fechaApertura: new Date(0) }));
    await permite('update con `createdAt` tampoco', () => intentar({ createdAt: new Date(0) }));
    await permite('update con `id` tampoco', () => intentar({ id: 999999 }));

    const despues: any = await R(Caja).findOne({
      where: { id: caja.id }, relations: ['createdBy', 'dispositivo', 'conteoApertura'],
    });
    ok((despues?.createdBy as any)?.id === (antes?.createdBy as any)?.id,
      'createdBy sigue siendo el abridor', { antes: (antes?.createdBy as any)?.id, despues: (despues?.createdBy as any)?.id });
    ok((despues?.dispositivo as any)?.id === dispP2.id, 'la caja no cambió de terminal', (despues?.dispositivo as any)?.id);
    ok((despues?.conteoApertura as any)?.id === (antes?.conteoApertura as any)?.id,
      'el conteo de apertura no se reemplaza', (despues?.conteoApertura as any)?.id);
    ok(new Date(despues?.fechaApertura).getTime() === new Date(antes?.fechaApertura).getTime(),
      'la fecha de apertura no se mueve');
    ok(new Date(despues?.createdAt).getTime() === new Date(antes?.createdAt).getTime(),
      'createdAt no se reescribe');
    ok((await R(Caja).findOneBy({ id: 999999 })) === null, 'el `id` del payload no creó ni pisó otra fila');

    // ⚠️ El guard «solo el usuario que abrió la caja puede cerrarla» NO se
    // puede ejercitar desde acá y es una limitación REAL del handler, no del
    // test: `update-caja` lo evalúa con `getCurrentUser()` crudo
    // (`financiero.handler.ts:825-826`) en vez de `getEffectiveUser`, así que
    // en modo servidor/PWA compara contra el usuario logueado en el desktop y
    // no contra el que hizo la request. Acá `getCurrentUser` es siempre el
    // cajero, y `como(gerente, …)` sólo cambia el usuario EFECTIVO. Queda
    // anotado como deuda: arreglarlo de un lado solo lo rompe, porque
    // `createdBy` se estampa con el mismo `getCurrentUser()` en `create-caja`.
    // Lo que este bloque sí gatea es que `createdBy` no se pueda pisar por
    // payload, que es la mitad que el PR sí cierra.

    // ── 16 · No hay reapertura de cajas (P3) ───────────────────────────────
    // La regla 2 exige FINANCIERO_CAJA_AJUSTAR pero no limita QUÉ se escribe:
    // sin la regla 1b, el gerente podía mandar `estado: ABIERTO` y revivir una
    // caja cerrada. Verificado por grep que ningún llamador lo hace: el único
    // `estado: ABIERTO` del frontend es el de la apertura (`create-caja`).
    console.log('\n[16] update-caja · CERRADO → ABIERTO se rechaza (P3)');
    await permite('el abridor cierra su caja',
      () => invokeHandler('update-caja', caja.id, { estado: 'CERRADO', fechaCierre: new Date() }));
    await rechaza('no se puede reabrir', 'ni siquiera con FINANCIERO_CAJA_AJUSTAR se reabre',
      () => como(gerente, () => invokeHandler('update-caja', caja.id, { estado: 'ABIERTO' })));
    ok((await R(Caja).findOneBy({ id: caja.id }))?.estado === 'CERRADO', 'la caja sigue CERRADO');
    // Y con el índice presente, la terminal queda libre para abrir una nueva:
    // esa es la salida legítima, no la reapertura.
    await permite('la salida legítima es abrir una caja nueva en la terminal', () => abrirCaja(dispP2.id));
  }

  // ── 17 · create-caja sólo abre cajas (P9) ────────────────────────────────
  // Con `estado: 'CERRADO'` el guard de duplicado no corría (sólo mira ABIERTO)
  // y el índice parcial tampoco cubre esa fila: quedaba una caja CERRADO que
  // nunca estuvo abierta, con arqueo propio y con el `dispositivo` que eligió
  // el cliente. Ningún llamador crea cajas cerradas (verificado: desktop
  // `create-caja-dialog:851` y `pago-dialog:818`, PWA `caja-abrir.page:102`,
  // los tres con ABIERTO).
  console.log('\n[17] create-caja · no crea cajas en otro estado (P9)');
  {
    const dispP9: any = await save(Dispositivo, { nombre: 'TERMINAL P9', activo: true, isCaja: true });
    const conteo = await nuevoConteo('APERTURA');
    await rechaza('solo abre cajas', 'create-caja con estado CERRADO se rechaza',
      () => invokeHandler('create-caja', {
        dispositivo: { id: dispP9.id }, conteoApertura: { id: conteo.id },
        fechaApertura: new Date(), activo: true, estado: 'CERRADO',
      }));
    ok(
      (await R(Caja).count({ where: { dispositivo: { id: dispP9.id } } as any })) === 0,
      'no quedó ninguna caja de ese dispositivo',
    );
    await permite('y con ABIERTO (o sin `estado`) sigue abriendo normal', () => abrirCaja(dispP9.id));
  }

  // ── 18 · Humo M5: cerrar una caja mientras otra escribe una venta ────────
  // `update-caja` pasó a ser transaccional en la Fase 2. En SQLite hay UNA sola
  // conexión: dos `dataSource.transaction()` intercalados comparten la
  // transacción física y el ROLLBACK/COMMIT de una pisa los INSERT de la otra
  // (es lo mismo que obligó a `withAperturaCajaLock` en la apertura). Por eso
  // el cierre vuelve a correr SIN transacción en SQLite
  // (`enTransaccionSiPostgres`). Acá se cruza el cierre de una caja con una
  // venta contra OTRA caja abierta: las dos tienen que sobrevivir.
  // ⚠️ **No es discriminante por sí solo**, y conviene decirlo: revertir
  // `enTransaccionSiPostgres` a `dataSource.transaction` NO lo hace fallar,
  // porque que las dos transacciones se pisen depende de que sus `await` caigan
  // dentro de la ventana de la otra, y acá no caen. Lo que sí gatea es la
  // regresión gruesa: que el cierre siga cerrando, generando su retiro, y que
  // una venta concurrente contra otra caja no se pierda. El mecanismo de fondo
  // se mide aparte, en [20].
  console.log('\n[18] Humo M5 · cierre de caja vs. createVenta concurrente');
  {
    const dispCierre: any = await save(Dispositivo, { nombre: 'TERMINAL M5 CIERRE', activo: true, isCaja: true });
    const dispVenta: any = await save(Dispositivo, { nombre: 'TERMINAL M5 VENTA', activo: true, isCaja: true });
    const cajaACerrar: any = await permite('caja que se va a cerrar', () => abrirCaja(dispCierre.id));
    const cajaViva: any = await permite('caja que sigue vendiendo', () => abrirCaja(dispVenta.id));
    const conteoM5 = await nuevoConteo('CIERRE');
    await save(ConteoDetalle, {
      conteo: { id: conteoM5.id }, monedaBillete: { id: billete50k.id }, cantidad: 1, activo: true,
    });

    const [resCierre, resVenta] = await Promise.allSettled([
      invokeHandler('update-caja', cajaACerrar.id, {
        estado: 'CERRADO', fechaCierre: new Date(), conteoCierre: { id: conteoM5.id },
      }),
      invokeHandler('createVenta', { estado: 'ABIERTA', caja: { id: cajaViva.id } }),
    ]);
    ok(resCierre.status === 'fulfilled', 'el cierre no falla por la venta concurrente',
      resCierre.status === 'rejected' ? String((resCierre as any).reason?.message) : undefined);
    ok(resVenta.status === 'fulfilled', 'la venta no falla por el cierre concurrente',
      resVenta.status === 'rejected' ? String((resVenta as any).reason?.message) : undefined);
    ok(
      (await R(Caja).findOneBy({ id: cajaACerrar.id }))?.estado === 'CERRADO',
      'la caja quedó efectivamente CERRADO (el cierre no se perdió en un rollback ajeno)',
    );
    const ventaId = resVenta.status === 'fulfilled' ? (resVenta.value as any)?.id : null;
    ok(
      ventaId != null && (await ds.getRepository(E('ventas/venta.entity').Venta).findOneBy({ id: ventaId })) != null,
      'la venta quedó persistida (no se la llevó el commit/rollback del cierre)',
      ventaId,
    );
    ok(
      (await R(RetiroCaja).count({ where: { caja: { id: cajaACerrar.id }, origen: 'CIERRE' } as any })) === 1,
      'y el retiro del cierre se generó igual (post-commit)',
    );
  }

  // ── 20 · El mecanismo: en SQLite dos transacciones comparten la física ───
  // Esto no prueba un fix del PR: MIDE la premisa sobre la que se apoyan dos
  // decisiones de diseño —`withAperturaCajaLock` en la apertura y
  // `enTransaccionSiPostgres` en el cierre y en los ajustes—. Hasta ahora la
  // premisa vivía sólo en comentarios («lo medimos»), sin nada que avise si
  // deja de ser cierta.
  //
  // El driver `sqlite3` tiene UNA conexión: dos `dataSource.transaction()`
  // intercalados terminan en la MISMA transacción física, así que el ROLLBACK
  // de uno descarta los INSERT del otro aunque ese otro haya commiteado.
  console.log('\n[20] SQLite · dos dataSource.transaction() comparten la transacción física');
  {
    const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const insertar = (m: any, nombre: string) => m.query(
      `INSERT INTO dispositivos (created_at, updated_at, nombre, activo)
       VALUES (datetime('now'), datetime('now'), ?, 1)`,
      [nombre],
    );

    const gana = ds.transaction(async (m) => {
      await insertar(m, 'TX COMPARTIDA ANTES');
      await espera(120);                       // acá se cuela la otra transacción
      await insertar(m, 'TX COMPARTIDA DESPUES');
    });
    const pierde = ds.transaction(async (m) => {
      await espera(40);
      await insertar(m, 'TX COMPARTIDA ROLLBACK');
      await espera(20);
      throw new Error('rollback a propósito');
    });
    const res = await Promise.allSettled([gana, pierde]);
    ok(res[0].status === 'fulfilled', 'la transacción "ganadora" commitea sin error');
    ok(res[1].status === 'rejected', 'la otra hace rollback');

    const nombres: any[] = await ds.query(
      `SELECT nombre FROM dispositivos WHERE nombre LIKE 'TX COMPARTIDA%' ORDER BY id`,
    );
    const quedaron = nombres.map((f: any) => String(f.nombre));
    ok(
      !quedaron.includes('TX COMPARTIDA ROLLBACK'),
      'la fila de la transacción que falló no quedó (hasta acá, todo normal)',
      quedaron,
    );
    // ESTE es el assert que importa: la fila que la transacción GANADORA
    // escribió ANTES del rollback ajeno tampoco sobrevivió. Si algún día este
    // assert falla, el driver dejó de compartir la transacción y se pueden
    // revisar `withAperturaCajaLock` y `enTransaccionSiPostgres`.
    ok(
      !quedaron.includes('TX COMPARTIDA ANTES') && quedaron.includes('TX COMPARTIDA DESPUES'),
      'el ROLLBACK ajeno se llevó puesto lo que la ganadora había escrito antes',
      quedaron,
    );
  }

  await ds.destroy();

  // ── 11 · La migración con duplicados preexistentes ───────────────────────
  // Base aparte: se corren las migraciones, se BORRA el rastro de la nueva y su
  // índice, se siembran dos cajas ABIERTO en el mismo dispositivo y se vuelve a
  // correr. Tiene que aplicar sin abortar y SIN crear el índice.
  console.log('\n[11] La migración con duplicados: no aborta y no crea el índice');
  const dbDup = nuevaDb('test-caja-apertura-dup.db');
  const dsDup = await abrirDs(dbDup);
  await dsDup.runMigrations({ transaction: 'each' });

  const Rd = (e: any) => dsDup.getRepository(e);
  const saveD = (e: any, data: any) => Rd(e).save(Rd(e).create(data as any) as any);
  const dispD: any = await saveD(E('financiero/dispositivo.entity').Dispositivo, {
    nombre: 'TERMINAL DUP', activo: true, isCaja: true,
  });
  const conteoD1: any = await saveD(E('financiero/conteo.entity').Conteo, {
    activo: true, tipo: 'APERTURA', fecha: new Date(),
  });
  const conteoD2: any = await saveD(E('financiero/conteo.entity').Conteo, {
    activo: true, tipo: 'APERTURA', fecha: new Date(),
  });

  // Volver la base al estado "antes de esta migración".
  await dsDup.query(`DROP INDEX IF EXISTS "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}"`);
  // D12: el nombre sale del MÓDULO de la migración, no hardcodeado. Con el
  // literal, cambiarle el timestamp a la migración dejaba el DELETE sin
  // matchear: no se reejecutaba y todo este bloque quedaba tautológico.
  await dsDup.query(
    `DELETE FROM typeorm_migrations WHERE name = ?`,
    [NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA],
  );
  for (const c of [conteoD1, conteoD2]) {
    await dsDup.query(
      `INSERT INTO cajas (created_at, updated_at, dispositivo_id, fecha_apertura,
                          conteo_apertura_id, estado, activo, revisado)
       VALUES (datetime('now'), datetime('now'), ?, datetime('now'), ?, 'ABIERTO', 1, 0)`,
      [dispD.id, c.id],
    );
  }
  ok((await dispositivosConCajasDuplicadas(dsDup)).length === 1, 'la base quedó con un dispositivo duplicado');

  let abortó = false;
  try { await dsDup.runMigrations({ transaction: 'each' }); } catch { abortó = true; }
  ok(!abortó, 'la migración NO aborta el arranque con duplicados (deja la app arrancando)');
  ok(!(await existeIndice(dsDup)), 'y NO crea el índice mientras haya duplicados');
  {
    const filas: any[] = await dsDup.query(
      `SELECT name FROM typeorm_migrations WHERE name = ?`,
      [NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA],
    );
    ok(
      filas.length === 1,
      'TypeORM la marca como EJECUTADA igual — por eso hace falta el reintento de arranque (B4)',
    );
  }

  // ── 12 · asegurarIndicesOpcionales: reintento idempotente ────────────────
  console.log('\n[12] asegurarIndicesOpcionales · lo crea en cuanto la base queda limpia');
  {
    const conDups = await asegurarIndicesOpcionales(dsDup);
    ok(conDups.cajaUnicaAbierta === 'duplicados', 'con duplicados informa "duplicados" y no crea nada', conDups);
    ok(!(await existeIndice(dsDup)), 'el índice sigue sin existir');

    // El operador cierra la sobrante (lo que el log le pide).
    const sobrante: any[] = await dsDup.query(
      `SELECT id FROM cajas WHERE dispositivo_id = ? AND estado = 'ABIERTO' ORDER BY id DESC LIMIT 1`,
      [dispD.id],
    );
    await dsDup.query(
      `UPDATE cajas SET estado = 'CERRADO', fecha_cierre = datetime('now') WHERE id = ?`,
      [sobrante[0].id],
    );

    const limpio = await asegurarIndicesOpcionales(dsDup);
    ok(limpio.cajaUnicaAbierta === 'ok', 'sin duplicados, el arranque siguiente lo crea solo', limpio);
    ok(await existeIndice(dsDup), 'el índice ya existe');

    // Idempotente: correrlo de nuevo no rompe.
    const otraVez = await asegurarIndicesOpcionales(dsDup);
    ok(otraVez.cajaUnicaAbierta === 'ok', 'volver a llamarlo es un no-op (IF NOT EXISTS)');
  }

  await dsDup.destroy();

  // ── 19 · Duplicados con `dispositivo_id IS NULL` (M9) ────────────────────
  // Un índice único PARCIAL trata los NULL como distintos en los dos drivers:
  // dos cajas ABIERTO sin dispositivo NO lo violan y el índice se crea igual.
  // El pre-chequeo, en cambio, las agrupaba en un solo `null (2)` y bloqueaba
  // para siempre la creación del control primario del invariante, en cada
  // arranque y con un log que mentía («Dispositivos: null (2)»).
  //
  // ⚠️ El estado NO es alcanzable con el esquema de hoy: `cajas.dispositivo_id`
  // es NOT NULL en las dos baselines y ninguna migración la afloja (así que la
  // premisa de M9 «el NOT NULL es sólo de la entidad» es falsa — verificado en
  // `1778378410416-Baseline.ts:104` y `1778380893207-BaselinePostgres.ts:104`).
  // Acá se fabrica a mano, reescribiendo el DDL con `writable_schema`, para
  // ejercitar el filtro: es defensa en profundidad, y sin el test el `AND
  // dispositivo_id IS NOT NULL` se borraría en cualquier limpieza futura.
  console.log('\n[19] Pre-chequeo de duplicados · las cajas sin dispositivo no cuentan (M9)');
  const dbNull = nuevaDb('test-caja-apertura-null.db');
  {
    const dsPrep = await abrirDs(dbNull);
    await dsPrep.runMigrations({ transaction: 'each' });
    await dsPrep.query(`DROP INDEX IF EXISTS "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}"`);
    await dsPrep.query(`DELETE FROM typeorm_migrations WHERE name = ?`, [NOMBRE_MIGRACION_CAJA_UNICA_ABIERTA]);
    // Los conteos primero: `conteo_apertura_id` es NOT NULL y UNIQUE.
    const conteos: number[] = [];
    for (let i = 0; i < 2; i++) {
      await dsPrep.query(
        `INSERT INTO conteos (created_at, updated_at, tipo, fecha, activo)
         VALUES (datetime('now'), datetime('now'), 'APERTURA', datetime('now'), 1)`,
      );
      const f: any[] = await dsPrep.query(`SELECT last_insert_rowid() AS id`);
      conteos.push(Number(f[0].id));
    }
    // Aflojar el NOT NULL de `dispositivo_id`. Es la única forma de llegar al
    // estado del que habla M9; el cambio muere con esta base descartable.
    await dsPrep.query(`PRAGMA writable_schema = ON`);
    await dsPrep.query(
      `UPDATE sqlite_master
          SET sql = replace(sql, '"dispositivo_id" integer NOT NULL', '"dispositivo_id" integer')
        WHERE type = 'table' AND name = 'cajas'`,
    );
    await dsPrep.query(`PRAGMA writable_schema = OFF`);
    await dsPrep.destroy();

    const dsNull = await abrirDs(dbNull);
    let sembro = '';
    try {
      for (const c of conteos) {
        await dsNull.query(
          `INSERT INTO cajas (created_at, updated_at, dispositivo_id, fecha_apertura,
                              conteo_apertura_id, estado, activo, revisado)
           VALUES (datetime('now'), datetime('now'), NULL, datetime('now'), ?, 'ABIERTO', 1, 0)`,
          [c],
        );
      }
    } catch (e: any) { sembro = String(e?.message || e); }
    ok(sembro === '', 'se pudieron sembrar dos cajas ABIERTO sin dispositivo', sembro || undefined);

    const dups = await dispositivosConCajasDuplicadas(dsNull);
    ok(dups.length === 0, 'el pre-chequeo NO las reporta como duplicado', dups);

    // Y el índice se crea igual, que es la prueba de que nunca fueron un
    // problema: los NULL son distintos entre sí para un único parcial.
    const res = await asegurarIndicesOpcionales(dsNull);
    ok(res.cajaUnicaAbierta === 'ok', 'con sólo NULLs duplicados, el índice se crea', res);
    const filas: any[] = await dsNull.query(`PRAGMA index_list('cajas')`);
    ok(
      (filas || []).some((f: any) => String(f.name) === UQ_CAJAS_ABIERTA_POR_DISPOSITIVO),
      'el índice único parcial convive con las dos cajas ABIERTO sin dispositivo',
    );
    ok(
      Number((await dsNull.query(`SELECT COUNT(*) AS n FROM cajas WHERE dispositivo_id IS NULL AND estado = 'ABIERTO'`))[0].n) === 2,
      'y las dos filas siguen ahí',
    );

    // La migración tampoco se traba: vuelve a correr y crea el índice.
    await dsNull.query(`DROP INDEX IF EXISTS "${UQ_CAJAS_ABIERTA_POR_DISPOSITIVO}"`);
    let abortóNull = false;
    try { await dsNull.runMigrations({ transaction: 'each' }); } catch { abortóNull = true; }
    ok(!abortóNull, 'la migración vuelve a correr sin abortar');
    const filas2: any[] = await dsNull.query(`PRAGMA index_list('cajas')`);
    ok(
      (filas2 || []).some((f: any) => String(f.name) === UQ_CAJAS_ABIERTA_POR_DISPOSITIVO),
      'y esta vez SÍ crea el índice (el pre-chequeo no la frena por los NULL)',
    );
    await dsNull.destroy();
  }

  // D15: la basura de `.tmp` no se acumula entre corridas.
  for (const f of [dbFile, dbDup, dbNull]) {
    for (const sufijo of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(`${f}${sufijo}`); } catch { /* no existía */ }
    }
  }

  console.log(`\n${failed === 0 ? '✅' : '❌'} caja-apertura: ${passed} OK, ${failed} fallidos\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
