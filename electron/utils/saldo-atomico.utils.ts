import { EntityManager } from 'typeorm';

/**
 * Ajustes **atómicos** de saldo (#190, follow-up de M-02).
 *
 * Antes, `cuentas_bancarias.saldo`, `saldo_reservado` y `clientes.saldo_actual`
 * se actualizaban con read-modify-write:
 *
 * ```ts
 * cb.saldo = Number(cb.saldo) + monto;   // con el saldo LEÍDO antes
 * await manager.save(CuentaBancaria, cb);
 * ```
 *
 * En Postgres (modo server, varias PC) dos transacciones que leen el mismo saldo
 * antes de que la otra haga commit se pisan y se pierde un movimiento.
 *
 * Acá el delta se aplica en el propio `UPDATE` (`SET col = ROUND(col + $d, 2)`):
 * Postgres re-evalúa `col` con la versión commiteada al tomar el lock de fila,
 * así que dos deltas concurrentes se suman los dos. El lock de fila se toma en el
 * mismo momento en que lo tomaba el `save()` de antes, así que no se adelanta
 * ningún lock ni sube el riesgo de deadlock (por eso no es un `FOR UPDATE` al
 * leer, que obligaría a un orden canónico de locks en todos los handlers).
 *
 * Devuelve el saldo nuevo para que el caller lo deje en la entidad (para
 * devolverlo o mostrarlo). **No hacer `save()` de la entidad después**: TypeORM
 * relee la fila y reescribe toda columna que difiera del objeto, que se cargó
 * antes, así que pisaría un ajuste concurrente de la otra columna de saldo
 * (`saldo` ↔ `saldo_reservado`) o de otro campo. El UPDATE ya guardó todo.
 *
 * Usar SIEMPRE el mismo `manager` del resto de la operación (el del
 * `queryRunner` si hay transacción), para que el ajuste se revierta con ella.
 */

type Col = { tabla: string; columna: string };

const SALDO_CUENTA: Col = { tabla: 'cuentas_bancarias', columna: 'saldo' };
const RESERVADO_CUENTA: Col = { tabla: 'cuentas_bancarias', columna: 'saldo_reservado' };
const SALDO_CLIENTE: Col = { tabla: 'clientes', columna: 'saldo_actual' };

function esPostgres(manager: EntityManager): boolean {
  return (manager.connection?.options?.type as string) === 'postgres';
}

/** Filas devueltas por `manager.query` de un UPDATE ... RETURNING en cada driver. */
function filasDe(res: any): any[] {
  // pg + TypeORM devuelve [filas, cantidad] para UPDATE; sqlite3, las filas.
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && typeof res[1] === 'number') {
    return res[0];
  }
  return Array.isArray(res) ? res : [];
}

async function ajustar(
  manager: EntityManager,
  col: Col,
  id: number,
  delta: number,
  opts?: { minCero?: boolean },
): Promise<number> {
  if (id == null || !Number.isFinite(Number(id))) {
    throw new Error(`${col.tabla}: id inválido para ajustar ${col.columna}`);
  }
  const d = Number(delta);
  if (!Number.isFinite(d)) {
    throw new Error(`${col.tabla} ${id}: delta inválido para ${col.columna} (${delta})`);
  }
  const pg = esPostgres(manager);
  const p = (n: number) => (pg ? `$${n}` : '?');
  // Postgres: decimal + numeric → numeric, ROUND exacto. SQLite: REAL, ROUND
  // como el `toFixed(2)` de antes.
  const suma = pg
    ? `ROUND(CAST(${col.columna} AS numeric) + CAST(${p(1)} AS numeric), 2)`
    : `ROUND(${col.columna} + ${p(1)}, 2)`;
  const nuevo = opts?.minCero ? (pg ? `GREATEST(0, ${suma})` : `MAX(0, ${suma})`) : suma;
  const update = `UPDATE ${col.tabla} SET ${col.columna} = ${nuevo} WHERE id = ${p(2)}`;
  let filas: any[];
  if (pg) {
    filas = filasDe(await manager.query(`${update} RETURNING ${col.columna} AS valor`, [d, Number(id)]));
  } else {
    // El query runner de SQLite manda todo lo que empieza con «UPDATE » por
    // `run()`, que no devuelve filas: se relee en la misma conexión. Con un solo
    // escritor (sqlite3, una conexión) el par es atómico de hecho.
    await manager.query(update, [d, Number(id)]);
    filas = await manager.query(`SELECT ${col.columna} AS valor FROM ${col.tabla} WHERE id = ?`, [Number(id)]);
  }
  if (!filas.length) {
    throw new Error(`${col.tabla} ${id} no encontrada (ajuste de ${col.columna})`);
  }
  return Number(filas[0].valor);
}

/** `cuentas_bancarias.saldo += delta` (atómico). Devuelve el saldo nuevo. */
export function ajustarSaldoCuentaBancaria(manager: EntityManager, cuentaId: number, delta: number): Promise<number> {
  return ajustar(manager, SALDO_CUENTA, cuentaId, delta);
}

/**
 * `cuentas_bancarias.saldo_reservado += delta` (atómico). Con `minCero` replica
 * el `Math.max(0, …)` de la liberación de cheques diferidos.
 */
export function ajustarSaldoReservadoCuentaBancaria(
  manager: EntityManager,
  cuentaId: number,
  delta: number,
  opts?: { minCero?: boolean },
): Promise<number> {
  return ajustar(manager, RESERVADO_CUENTA, cuentaId, delta, opts);
}

/** `clientes.saldo_actual += delta` (atómico). Devuelve el saldo nuevo. */
export function ajustarSaldoCliente(manager: EntityManager, clienteId: number, delta: number): Promise<number> {
  return ajustar(manager, SALDO_CLIENTE, clienteId, delta);
}
