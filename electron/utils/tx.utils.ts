import { DataSource, EntityManager } from 'typeorm';

/**
 * Transacción **sólo en Postgres**; en SQLite se ejecuta el mismo cuerpo con el
 * `manager` del `DataSource`, sin abrir transacción explícita.
 *
 * ⚠️ **No es una optimización, es una defensa contra una regresión medida.** En
 * SQLite (driver `sqlite3`, el del modo standalone) TypeORM tiene **una sola
 * conexión**, así que dos `dataSource.transaction()` que se intercalan terminan
 * compartiendo la MISMA transacción física: el `ROLLBACK` de una descarta los
 * INSERT de la otra. Los implementadores de la Fase 2 lo midieron con el doble
 * click en «ABRIR CAJA» (quedaban cero cajas abiertas y un mensaje falso), y por
 * eso existe `withAperturaCajaLock`. Sumar transacciones nuevas en SQLite
 * —cierre de caja, ajustes de gasto/retiro, cobro— reabre ese modo de falla
 * contra `createVenta`, `delivery-crear`, `transferir-venta-pdv` y
 * `registrarCobroParcial`, que sí abren la suya (hallazgo M5 de la auditoría).
 *
 * En Postgres cada transacción toma su propia conexión del pool, así que ahí
 * envolver es correcto **y necesario**: es lo único que hace efectivos los
 * `FOR SHARE`/`FOR UPDATE` del guard de caja (`puedeBloquear` exige una
 * transacción activa) y lo que cierra el TOCTOU con un cierre concurrente.
 *
 * Qué se gana en SQLite sin transacción: nada peor que antes. El guard corre
 * igual (sin lock, que el driver ignoraba de todos modos) y el único escritor
 * del proceso serializa de hecho.
 *
 * Uso:
 * ```ts
 * const guardado = await enTransaccionSiPostgres(dataSource, async (manager) => {
 *   await assertCajaAbierta(manager, cajaId, { lock: 'read' });
 *   return await manager.getRepository(GastoCaja).save(entity);
 * });
 * // el emit y los best-effort van ACÁ, después del commit
 * ```
 */
export async function enTransaccionSiPostgres<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  if (dataSource.options.type === 'postgres') {
    return await dataSource.transaction(async (manager) => await fn(manager));
  }
  return await fn(dataSource.manager);
}

/** ¿El ejecutor está dentro de una transacción activa? (para no anidar). */
export function enTransaccionActiva(manager: EntityManager | null | undefined): boolean {
  return manager?.queryRunner?.isTransactionActive === true;
}
