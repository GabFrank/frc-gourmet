/**
 * Hooks de eventos de negocio → Funciones y Tareas (§4, §10 A7).
 *
 * Los handlers de caja y compras llaman `dispararEventoFt` DESPUÉS del commit. Nunca lanza
 * y nunca espera: agenda `ftOnEvento` con `setImmediate` y atrapa cualquier error (sincrónico
 * o de la promesa). Un fallo del módulo FT jamás rompe una apertura/cierre de caja ni una compra.
 */
import { DataSource } from 'typeorm';
import { FtEvento, FtEventoCaja } from '../../../src/app/database/entities/rrhh/funciones-tareas/ft.enums';
import { ftOnEvento } from './motor';

type InterceptorFt = (tipo: FtEvento, ref: string, tipoCaja: FtEventoCaja | null) => void | Promise<void>;
let interceptor: InterceptorFt | null = null;
let ultimo: Promise<void> = Promise.resolve();

/** Solo para tests: corre antes de ftOnEvento (sirve para forzar un error) o con null lo quita. */
export function fijarInterceptorEventoFt(fn: InterceptorFt | null): void {
  interceptor = fn;
}

/** Solo para tests: la promesa del último evento agendado (ya con su error atrapado). */
export function esperarEventosFt(): Promise<void> {
  return ultimo;
}

export function dispararEventoFt(
  ds: DataSource, tipo: FtEvento, ref: string | number | null | undefined,
  tipoCaja: FtEventoCaja | null = null, usuarioId?: number | null,
): void {
  try {
    if (ref === null || ref === undefined || ref === '') return;
    const r = String(ref);
    ultimo = new Promise<void>((resolve) => {
      setImmediate(() => {
        Promise.resolve()
          .then(async () => {
            if (interceptor) await interceptor(tipo, r, tipoCaja);
            await ftOnEvento(ds, tipo, r, { tipoCaja, usuarioId: usuarioId ?? null });
          })
          .catch((e) => console.warn(`[ft-eventos] ${tipo} ${tipoCaja ?? ''} ${r} falló (la operación siguió normal):`, e?.message ?? e))
          .finally(resolve);
      });
    });
  } catch (e: any) {
    console.warn(`[ft-eventos] no se pudo agendar ${tipo}:`, e?.message ?? e);
  }
}
