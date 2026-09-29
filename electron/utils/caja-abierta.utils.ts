import { DataSource, EntityManager } from 'typeorm';
import { Caja, CajaEstado } from '../../src/app/database/entities/financiero/caja.entity';
import { Venta } from '../../src/app/database/entities/ventas/venta.entity';
import { Pago } from '../../src/app/database/entities/compras/pago.entity';
import { RetiroCaja } from '../../src/app/database/entities/financiero/retiro-caja.entity';
import { RetiroCajaEstado, RetiroCajaOrigen } from '../../src/app/database/entities/financiero/caja-mayor-enums';
import { Usuario } from '../../src/app/database/entities/personas/usuario.entity';
import { ensurePermission, getEffectiveUser } from './auth.utils';
import { emitCajaCambio } from './mesa-emit.utils';

/**
 * Invariante de caja: **ninguna escritura de plata entra a una caja que no está
 * `ABIERTO`.**
 *
 * El 24/09 la pestaña del PdV se quedó con la caja #122 en memoria después de
 * que se cerrara, y el backend aceptó todo: 10 ventas, 52 cobros, 11 gastos y
 * un retiro contra una caja cerrada. Ningún handler miraba `caja.estado` salvo
 * los egresos del cajón. Este helper es ese chequeo, centralizado.
 *
 * ⚠️ **No vive en `terminal-caja.utils.ts` a propósito.** Ese gate es *opt-in*
 * (sólo corre cuando el llamador manda `validarDispositivoCaja`) y su propio
 * encabezado dice que no es una frontera de seguridad sino un candado
 * operativo. Este invariante tiene que correr SIEMPRE; colgarlo de allá le
 * haría heredar la semántica opt-in — bastaría con omitir el flag para
 * saltearlo. Son dos reglas distintas y conviene que se vean distintas.
 *
 * ⚠️ **El código viaja en el `message`, no en `err.code`.** Los tres
 * transportes degradan el error distinto y sólo el string sobrevive a los tres:
 * IPC local lo prefija con "Error invoking remote method", `/api/rpc` responde
 * `500 { error: msg }` (pierde `code` salvo FORBIDDEN/UNAUTHORIZED) y el modo
 * cliente arma `new Error('HTTP 500: {"error":"…"}')`. En los tres,
 * `String(e?.message).includes('CAJA_CERRADA')` funciona. Se setea igual
 * `err.code` para el consumo server-side.
 *
 * ⚠️ **El lock va SIN `relations`.** `findOne({ where, relations, lock })`
 * genera LEFT JOIN y Postgres rechaza `FOR UPDATE`/`FOR SHARE` sobre el lado
 * nulable de un outer join — es el bug del issue #258, documentado en
 * `scripts/test-locks-postgres-e2e.ts`. Por eso `leerEstadoCaja` selecciona
 * columnas escalares y nada más. En SQLite el driver ignora los locks y además
 * hay un solo escritor: la rama se omite entera.
 */

export const ERROR_CAJA_CERRADA = 'CAJA_CERRADA';

/** Cualquier ejecutor de consultas: el `DataSource` o el manager de una transacción. */
export type EjecutorCaja = DataSource | EntityManager;

export interface EstadoCajaMinimo {
  id: number;
  estado: CajaEstado;
  fechaCierre: Date | null;
}

export interface OpcionesCajaAbierta {
  /** `read` → FOR SHARE (escritores), `write` → FOR UPDATE (el cierre). Sólo Postgres. */
  lock?: 'read' | 'write';
  /** Texto libre para el log cuando el guard rechaza (nombre del canal). */
  contexto?: string;
}

function managerDe(ejecutor: EjecutorCaja): EntityManager {
  return ejecutor instanceof DataSource ? ejecutor.manager : ejecutor;
}

function esPostgres(ejecutor: EjecutorCaja): boolean {
  const opciones = ejecutor instanceof DataSource
    ? ejecutor.options
    : ejecutor.connection?.options;
  return opciones?.type === 'postgres';
}

/**
 * El lock sólo se puede pedir dentro de una transacción activa: fuera de ella
 * TypeORM lanza `PessimisticLockTransactionRequiredError`. Cuando el canal no
 * abre transacción (le pasa el `DataSource`) no hay nada que serializar, así
 * que el guard corre igual pero sin lock.
 */
function puedeBloquear(ejecutor: EjecutorCaja, lock?: 'read' | 'write'): boolean {
  if (!lock || !esPostgres(ejecutor)) return false;
  const qr = (ejecutor as EntityManager).queryRunner;
  return qr?.isTransactionActive === true;
}

/** Estado mínimo de una caja, leído sin relaciones (ver el aviso del #258). */
export async function leerEstadoCaja(
  ejecutor: EjecutorCaja,
  cajaId: number | null | undefined,
  opts?: OpcionesCajaAbierta,
): Promise<EstadoCajaMinimo | null> {
  const id = Number(cajaId) || null;
  if (!id) return null;

  const manager = managerDe(ejecutor);
  const caja = await manager.getRepository(Caja).findOne({
    where: { id },
    select: { id: true, estado: true, fechaCierre: true } as any,
    ...(puedeBloquear(ejecutor, opts?.lock)
      ? { lock: { mode: (opts!.lock === 'write' ? 'pessimistic_write' : 'pessimistic_read') as any } }
      : {}),
  });
  if (!caja) return null;
  return {
    id: caja.id,
    estado: caja.estado,
    fechaCierre: (caja.fechaCierre as any) ?? null,
  };
}

/** `dd/mm/aaaa hh:mm` — el formato que el cajero lee en la pantalla de cajas. */
function formatearFecha(fecha: Date | string | null): string {
  if (!fecha) return '';
  const d = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Error canónico del invariante. El mensaje está en español y lleva el prefijo. */
export function errorCajaCerrada(
  cajaId: number | null | undefined,
  estado?: EstadoCajaMinimo | null,
): Error {
  const id = Number(cajaId) || 0;
  let detalle: string;
  if (!estado) {
    detalle = `La caja #${id} no existe o no está abierta.`;
  } else {
    const cuando = formatearFecha(estado.fechaCierre);
    detalle = cuando
      ? `La caja #${id} ya fue cerrada el ${cuando}.`
      : `La caja #${id} ya fue cerrada.`;
  }
  const err: any = new Error(
    `${ERROR_CAJA_CERRADA}: ${detalle} No se pueden registrar más operaciones en ella. `
    + 'Abrí o seleccioná una caja abierta.',
  );
  err.code = ERROR_CAJA_CERRADA;
  return err;
}

/**
 * Lanza `CAJA_CERRADA` si la caja no existe o no está `ABIERTO`.
 *
 * ⚠️ Pasarle el `DataSource` cuando la escritura corre dentro de una
 * transacción convierte el guard en un **no-op transaccional**: lee fuera de la
 * transacción y el TOCTOU con el cierre concurrente queda abierto. Cada canal
 * tiene que pasarle el `manager`/`queryRunner.manager` que usa para escribir.
 */
export async function assertCajaAbierta(
  ejecutor: EjecutorCaja,
  cajaId: number | null | undefined,
  opts?: OpcionesCajaAbierta,
): Promise<EstadoCajaMinimo> {
  const estado = await leerEstadoCaja(ejecutor, cajaId, opts);
  if (!estado || estado.estado !== CajaEstado.ABIERTO) {
    if (opts?.contexto) {
      console.warn(`[${opts.contexto}] rechazado por caja cerrada (caja ${cajaId ?? 'null'}).`);
    }
    throw errorCajaCerrada(cajaId, estado);
  }
  return estado;
}

// ─── Apertura: una sola caja ABIERTO por dispositivo (D9 / D10) ─────────────

export const ERROR_CAJA_ABIERTA_DUPLICADA = 'CAJA_ABIERTA_DUPLICADA';

/** Nombre del índice único parcial creado por la migración de la Fase 2. */
export const INDICE_CAJA_UNICA_ABIERTA = 'UQ_cajas_abierta_por_dispositivo';

/**
 * Error canónico de "esta terminal ya tiene una caja abierta". Mismo texto
 * tanto si lo produce el guard como si lo produce el índice único: el cajero
 * no tiene por qué ver dos mensajes distintos para el mismo problema.
 */
export function errorCajaAbiertaDuplicada(cajaExistenteId?: number | null): Error {
  const cual = Number(cajaExistenteId) ? ` (caja #${Number(cajaExistenteId)})` : '';
  const err: any = new Error(
    `${ERROR_CAJA_ABIERTA_DUPLICADA}: Ya hay una caja abierta en esta terminal${cual}. `
    + 'Cerrá esa caja antes de abrir otra.',
  );
  err.code = ERROR_CAJA_ABIERTA_DUPLICADA;
  return err;
}

/**
 * ¿El error viene de la violación del índice único parcial?
 *
 * Los dos drivers lo reportan distinto, **y ninguno de los dos dice lo mismo**
 * (verificado empíricamente contra el driver `sqlite3` del repo):
 *  - **Postgres** (`pg`): `code === '23505'` y el mensaje nombra el índice —
 *    `duplicate key value violates unique constraint "UQ_cajas_abierta_por_dispositivo"`.
 *    El nombre conserva el casing porque se creó entre comillas dobles.
 *  - **SQLite**: el mensaje nombra la **columna, no el índice** —
 *    `SQLITE_CONSTRAINT: UNIQUE constraint failed: cajas.dispositivo_id` —, y
 *    el `QueryFailedError` conserva `code === 'SQLITE_CONSTRAINT'`.
 *
 * ⚠️ Por eso **no alcanza** con `code === '23505'` ni con "cualquier UNIQUE de
 * SQLite": `cajas` tiene otro índice único (`conteo_apertura_id`, por el
 * `@OneToOne`), y reusar un conteo de apertura daría «Ya hay una caja abierta
 * en esta terminal», que sería falso. El matcher exige que el error nombre
 * este índice o esta columna.
 */
export function esViolacionCajaUnicaAbierta(error: any): boolean {
  const codigo = String(error?.code ?? error?.driverError?.code ?? '');
  const mensaje = String(error?.message ?? error?.driverError?.message ?? '');
  // Postgres: el nombre del índice viene en el mensaje.
  if (mensaje.toLowerCase().includes(INDICE_CAJA_UNICA_ABIERTA.toLowerCase())) {
    return codigo === '23505' || /unique/i.test(mensaje);
  }
  // SQLite: el mensaje nombra `tabla.columna`.
  return codigo.startsWith('SQLITE_CONSTRAINT')
    && /UNIQUE constraint failed:[^\n]*\bcajas\.dispositivo_id\b/i.test(mensaje);
}

/**
 * Id de la caja `ABIERTO` del dispositivo, o `null`.
 *
 * ⚠️ El `FOR UPDATE` (sólo Postgres, sólo dentro de transacción) sirve para no
 * decidir contra un cierre concurrente **cuando la fila existe**. NO cierra la
 * carrera de doble apertura: si el dispositivo no tiene ninguna caja abierta el
 * lock matchea cero filas y `READ COMMITTED` no toma gap locks, así que dos
 * transacciones concurrentes leen cero las dos y pasan las dos. Eso lo cierra
 * el índice único parcial (ver la migración). Va sin `relations` por el #258.
 */
export async function cajaAbiertaDeDispositivo(
  ejecutor: EjecutorCaja,
  dispositivoId: number | null | undefined,
  opts?: OpcionesCajaAbierta,
): Promise<number | null> {
  const id = Number(dispositivoId) || null;
  if (!id) return null;
  const qb = managerDe(ejecutor)
    .createQueryBuilder(Caja, 'c')
    .select('c.id', 'id')
    .where('c.dispositivo_id = :id AND c.estado = :estado', { id, estado: CajaEstado.ABIERTO })
    .orderBy('c.id', 'ASC');
  if (puedeBloquear(ejecutor, opts?.lock)) {
    qb.setLock(opts!.lock === 'write' ? 'pessimistic_write' : 'pessimistic_read');
  }
  const fila = await qb.getRawOne();
  return fila?.id != null ? Number(fila.id) : null;
}

/**
 * Serializa **por dispositivo** las aperturas de caja dentro de este proceso.
 *
 * ⚠️ No es cosmético, y se descubrió midiendo: en SQLite (driver `sqlite3`,
 * el del modo standalone) TypeORM tiene **una sola conexión**, así que dos
 * `dataSource.transaction()` que se intercalan terminan compartiendo la MISMA
 * transacción física. Si la segunda revienta contra el índice único, su
 * `ROLLBACK` **descarta también el INSERT de la primera**: un doble click en
 * «ABRIR CAJA» dejaba cero cajas abiertas y el mensaje «Ya hay una caja
 * abierta en esta terminal», que además era mentira. Antes de la Fase 2 no
 * pasaba porque `create-caja` no abría transacción.
 *
 * Con el candado, la segunda apertura empieza cuando la primera ya commiteó:
 * la rechaza el guard, limpio, y la ganadora sobrevive. Mismo patrón que
 * `withMesaLock` en `ventas.handler.ts` (cola de promesas por clave, proceso
 * Node único). No reemplaza al índice: entre dos procesos —dos instancias de
 * Electron sobre el mismo archivo, o dos nodos contra el mismo Postgres— el
 * único control es el índice.
 */
const aperturaTails = new Map<number, Promise<void>>();
export async function withAperturaCajaLock<T>(
  dispositivoId: number | null | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const clave = Number(dispositivoId) || 0;
  const prev = aperturaTails.get(clave) ?? Promise.resolve();
  let release!: () => void;
  const myTurn = new Promise<void>((res) => (release = res));
  const composed = prev.then(() => myTurn);
  aperturaTails.set(clave, composed);
  await prev.catch(() => { /* el turno anterior falló: igual nos toca */ });
  try {
    return await fn();
  } finally {
    release();
    if (aperturaTails.get(clave) === composed) aperturaTails.delete(clave);
  }
}

/**
 * Envuelve el `save` de una apertura: si el índice único rechaza el INSERT,
 * traduce la violación al mismo mensaje humano que el guard.
 *
 * **Esto no es un extra, es el control primario del invariante** (ver D9 del
 * plan): el guard `count`/`findOne` sólo cubre la carrera lenta.
 */
export async function guardarAperturaTraduciendoDuplicado<T>(
  guardar: () => Promise<T>,
  dispositivoId: number | null | undefined,
  ejecutor?: EjecutorCaja,
): Promise<T> {
  try {
    return await guardar();
  } catch (error: any) {
    if (!esViolacionCajaUnicaAbierta(error)) throw error;
    // La transacción que insertó ya está abortada: la caja ganadora se busca
    // sólo si el llamador pasó un ejecutor fuera de ella (best-effort).
    let existente: number | null = null;
    if (ejecutor) {
      try { existente = await cajaAbiertaDeDispositivo(ejecutor, dispositivoId); } catch { /* best-effort */ }
    }
    throw errorCajaAbiertaDuplicada(existente);
  }
}

/**
 * Igual que `assertCajaAbierta`, pero **no hace nada cuando no hay caja**.
 *
 * `Venta.caja` y `Pago.caja` son FK nullable y hay flujos que crean registros
 * sin imputarlos a ninguna caja (ventas de prueba, pagos de compra que no salen
 * del cajón). Una venta sin caja no descuadra ningún arqueo — no está en
 * ninguno —, así que exigirla sería una regla nueva, distinta de este
 * invariante, y queda fuera de alcance. Lo que este guard impide es imputar
 * plata a una caja que **existe y ya se cerró**.
 */
export async function assertCajaAbiertaSiVino(
  ejecutor: EjecutorCaja,
  cajaId: number | null | undefined,
  opts?: OpcionesCajaAbierta,
): Promise<void> {
  if (!Number(cajaId)) return;
  await assertCajaAbierta(ejecutor, cajaId, opts);
}

/** Resuelve la caja de una venta server-side (nunca del payload). */
export async function cajaDeVenta(
  ejecutor: EjecutorCaja,
  ventaId: number | null | undefined,
): Promise<number | null> {
  const id = Number(ventaId) || null;
  if (!id) return null;
  const fila = await managerDe(ejecutor)
    .createQueryBuilder()
    .select('v.caja_id', 'cajaId')
    .from(Venta, 'v')
    .where('v.id = :id', { id })
    .getRawOne();
  return fila?.cajaId != null ? Number(fila.cajaId) : null;
}

/** Resuelve la caja de un pago server-side. */
export async function cajaDePago(
  ejecutor: EjecutorCaja,
  pagoId: number | null | undefined,
): Promise<number | null> {
  const id = Number(pagoId) || null;
  if (!id) return null;
  const fila = await managerDe(ejecutor)
    .createQueryBuilder()
    .select('p.caja_id', 'cajaId')
    .from(Pago, 'p')
    .where('p.id = :id', { id })
    .getRawOne();
  return fila?.cajaId != null ? Number(fila.cajaId) : null;
}

// ─── Ajuste sobre una caja ya cerrada (D6) ──────────────────────────────────

export interface AjustePayload {
  motivo?: string;
}

export interface ResultadoAjusteCaja {
  /** true sólo si la caja estaba CERRADA y el llamador pidió ajuste con motivo. */
  esAjuste: boolean;
  motivo: string | null;
}

/**
 * Variante del guard para los canales que Financiero › Cajas puede ejecutar
 * sobre una caja **ya cerrada** ("agregar el gasto/retiro que faltó"):
 * `create-gasto-caja`, `edit-gasto-caja`, `anular-gasto-caja` y
 * `create-retiro-caja`.
 *
 * - Caja `ABIERTO` → el flag `ajuste` se **ignora** (no hay nada que ajustar),
 *   así el frontend puede mandarlo siempre sin ramificar.
 * - Caja cerrada sin `ajuste` → `CAJA_CERRADA`.
 * - Caja cerrada con `ajuste` → exige `FINANCIERO_CAJA_AJUSTAR`, motivo no
 *   vacío y la **misma condición que `puede-ajustar-caja`**: el retiro del
 *   cierre no puede estar ya `INGRESADO` en Caja Mayor.
 *
 * ⚠️ El `ensurePermission` operativo del handler va **antes** que este helper.
 * Si el de ajuste corriera primero, un cajero que agrega un gasto a la caja
 * equivocada recibiría «PERMISO REQUERIDO: FINANCIERO_CAJA_AJUSTAR» en vez del
 * mensaje que explica qué pasó.
 */
export async function assertCajaOperableConAjuste(
  ejecutor: EjecutorCaja,
  cajaId: number | null | undefined,
  ajuste: AjustePayload | null | undefined,
  ctx: {
    dataSource: DataSource;
    getCurrentUser: () => Usuario | null;
    contexto?: string;
    lock?: 'read' | 'write';
  },
): Promise<ResultadoAjusteCaja> {
  const estado = await leerEstadoCaja(ejecutor, cajaId, { lock: ctx.lock, contexto: ctx.contexto });
  if (estado && estado.estado === CajaEstado.ABIERTO) {
    return { esAjuste: false, motivo: null };
  }

  if (!ajuste) {
    if (ctx.contexto) {
      console.warn(`[${ctx.contexto}] rechazado por caja cerrada (caja ${cajaId ?? 'null'}).`);
    }
    throw errorCajaCerrada(cajaId, estado);
  }

  // La caja tiene que existir para poder ajustarla.
  if (!estado) throw errorCajaCerrada(cajaId, null);

  await ensurePermission(ctx.dataSource, ctx.getCurrentUser, 'FINANCIERO_CAJA_AJUSTAR');

  const motivo = String(ajuste.motivo ?? '').trim().toUpperCase();
  if (!motivo) {
    throw new Error('El motivo del ajuste es obligatorio para operar sobre una caja cerrada.');
  }

  const retiroCierre = await managerDe(ejecutor).getRepository(RetiroCaja).findOne({
    where: { caja: { id: estado.id }, origen: RetiroCajaOrigen.CIERRE } as any,
    order: { id: 'DESC' },
  });
  if (retiroCierre && retiroCierre.estado === RetiroCajaEstado.INGRESADO) {
    throw new Error(
      'El retiro del cierre ya fue ingresado a Caja Mayor. '
      + 'Revertí ese ingreso desde Caja Mayor antes de ajustar la caja.',
    );
  }

  return { esAjuste: true, motivo };
}

/**
 * Avisa a las terminales de que una caja **ajustada** cambió (hallazgo P8).
 *
 * Se llama DESPUÉS del commit de los canales de ajuste (`create`/`edit`/
 * `anular-gasto-caja`, `create-retiro-caja`): un ajuste mueve el arqueo y
 * `revisado` de una caja que el PdV y los resúmenes están mirando, y hasta ahora
 * sólo `create-caja`/`update-caja`/`abrir-caja-desde-conteo`/
 * `finalizar-ajuste-caja` emitían el evento.
 *
 * El estado se **relee de la base** en vez de asumir `CERRADO`: el payload de
 * `CAJA_CAMBIO` declara `cajaEstado` y mentirle al consumidor por una caja
 * `CANCELADO` sería gratis y falso. Never-throws (`emitCajaCambio` ya traga sus
 * errores, y la lectura va en try/catch).
 */
export async function emitirCambioDeCajaAjustada(
  ejecutor: EjecutorCaja,
  cajaId: number | null | undefined,
): Promise<void> {
  const id = Number(cajaId) || 0;
  if (!id) return;
  try {
    const estado = await leerEstadoCaja(ejecutor, id);
    await emitCajaCambio(ejecutor as any, id, estado?.estado ?? '');
  } catch (e) {
    console.warn(`[caja-abierta] no se pudo avisar del ajuste de la caja ${id}:`, e);
  }
}

/**
 * Estampa la traza del ajuste en la `Caja` — `revisado`, `revisadoPor` y
 * `motivoAjuste` (UPPERCASE, igual que `finalizar-ajuste-caja`).
 *
 * Se llama en la **misma transacción** que la escritura del gasto/retiro
 * (hallazgo P7): estampar después del commit dejaba la caja ajustada sin traza
 * si esto fallaba. En SQLite no hay transacción (ver `tx.utils.ts`), así que
 * ahí sigue siendo "primero la escritura, después la traza".
 */
export async function estamparTrazaAjuste(
  ejecutor: EjecutorCaja,
  cajaId: number,
  motivo: string,
  getCurrentUser: () => Usuario | null,
): Promise<void> {
  const usuario = getEffectiveUser(getCurrentUser);
  const manager = managerDe(ejecutor);
  await manager.getRepository(Caja).update(cajaId, {
    revisado: true,
    motivoAjuste: motivo,
    ...(usuario?.id ? { revisadoPor: { id: usuario.id } as any } : {}),
    ...(usuario?.id ? { updatedBy: { id: usuario.id } as any } : {}),
  } as any);
}
