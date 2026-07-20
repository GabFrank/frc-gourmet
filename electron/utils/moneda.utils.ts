/**
 * Conversión de montos a la moneda principal (PYG) en el backend.
 *
 * Modelo: `MonedaCambio` guarda la cotización local (`compraLocal`) para
 * convertir de `monedaOrigen` a `monedaDestino`. Para llevar un monto de una
 * divisa a la principal se MULTIPLICA por `compraLocal` (misma convención que
 * el helper frontend `conversion-moneda.ts` y los dashboards existentes).
 *
 * No existía un helper reutilizable en electron: cada dominio lo hacía inline.
 * Este centraliza la lógica para RRHH y cualquier otro handler.
 */
import { DataSource } from 'typeorm';
import { Moneda } from '../../src/app/database/entities/financiero/moneda.entity';
import { MonedaCambio } from '../../src/app/database/entities/financiero/moneda-cambio.entity';

export interface ConversionResult {
  /** Monto en la moneda principal, o null si no hay cotización para convertir. */
  montoPrincipal: number | null;
  /** Tasa usada (1 si ya era principal), o null si faltaba cotización. */
  tasa: number | null;
  esPrincipal: boolean;
}

export async function getMonedaPrincipal(dataSource: DataSource): Promise<Moneda | null> {
  return dataSource.getRepository(Moneda).findOne({ where: { principal: true } as any });
}

/**
 * Tasa (compraLocal) para convertir de `origenId` a `destinoId`. 1 si son la
 * misma moneda; null si no hay cotización activa registrada.
 */
export async function getCotizacionCompraLocal(
  dataSource: DataSource,
  origenId: number,
  destinoId: number,
): Promise<number | null> {
  if (origenId === destinoId) return 1;
  const cambio = await dataSource.getRepository(MonedaCambio).findOne({
    where: { monedaOrigen: { id: origenId } as any, monedaDestino: { id: destinoId } as any, activo: true },
    order: { createdAt: 'DESC' as any },
  });
  const tasa = cambio ? Number(cambio.compraLocal) : 0;
  return tasa > 0 ? tasa : null;
}

/**
 * Convierte `monto` (en la moneda `monedaId`) a la moneda principal. Si la
 * moneda ya es la principal, devuelve el monto. Si falta cotización, devuelve
 * `montoPrincipal: null` para que el caller decida (no inventa un valor).
 */
export async function convertirAPrincipal(
  dataSource: DataSource,
  monto: number,
  monedaId: number | null | undefined,
  principal?: Moneda | null,
): Promise<ConversionResult> {
  const principalMoneda = principal ?? (await getMonedaPrincipal(dataSource));
  const m = Number(monto) || 0;
  if (!principalMoneda || !monedaId || monedaId === principalMoneda.id) {
    return { montoPrincipal: m, tasa: 1, esPrincipal: true };
  }
  const tasa = await getCotizacionCompraLocal(dataSource, monedaId, principalMoneda.id);
  if (tasa == null) return { montoPrincipal: null, tasa: null, esPrincipal: false };
  return { montoPrincipal: +(m * tasa).toFixed(2), tasa, esPrincipal: false };
}
