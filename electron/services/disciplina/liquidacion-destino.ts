/**
 * Destino en liquidación de multas/premios DR (puro). Ver PLAN §5 y §12.
 *  - Mes abierto = sin liquidación o con liquidación BORRADOR. Si el mes del hecho está
 *    APROBADA/PAGADA, va al siguiente mes abierto.
 *  - Tope mensual de descuentos DR (null = sin tope): lo que excede pasa a meses siguientes.
 *  - Moneda de la multa/premio = moneda del sueldo; si no coincide, se rechaza.
 */
import { DisciplinaError, Id } from './errores';
import { mesDe, mesSiguiente } from './fechas';

export type EstadoLiquidacion = 'BORRADOR' | 'APROBADA' | 'PAGADA';
export type EstadosLiquidacionPorMes = Record<string, EstadoLiquidacion | undefined>;

const MAX_MESES_BUSQUEDA = 120;

export function mesAbierto(estado: EstadoLiquidacion | undefined | null): boolean {
  return estado === undefined || estado === null || estado === 'BORRADOR';
}

/** Primer mes ('YYYY-MM') abierto desde el mes del hecho inclusive. */
export function mesDestino(fechaHecho: string, estadosLiquidacionPorMes: EstadosLiquidacionPorMes): string {
  let mes = mesDe(fechaHecho);
  for (let i = 0; i < MAX_MESES_BUSQUEDA; i++) {
    if (mesAbierto(estadosLiquidacionPorMes[mes])) return mes;
    mes = mesSiguiente(mes);
  }
  throw new DisciplinaError('SIN_MES_ABIERTO', 'NO HAY MES DE LIQUIDACIÓN ABIERTO');
}

export interface ResultadoTope {
  montoEsteMes: number;
  excedente: number;
}

/**
 * @param yaDescontadoEnMes descuentos DR ya imputados a ese funcionario y mes.
 * @param tope `dr.tope_descuento_mensual`; null/undefined = sin tope.
 */
export function aplicarTope(monto: number, yaDescontadoEnMes: number, tope: number | null | undefined): ResultadoTope {
  const m = Math.max(0, Number(monto) || 0);
  if (tope === null || tope === undefined) return { montoEsteMes: m, excedente: 0 };
  const disponible = Math.max(0, Number(tope) - Math.max(0, Number(yaDescontadoEnMes) || 0));
  const montoEsteMes = Math.min(m, disponible);
  return { montoEsteMes, excedente: m - montoEsteMes };
}

/** Lanza MONEDA_DISTINTA si la moneda de la multa/premio no es la del sueldo. */
export function validarMoneda(monedaMulta: Id | null | undefined, monedaSueldo: Id | null | undefined): void {
  const norm = (m: Id | null | undefined) => String(m ?? '').trim().toUpperCase();
  if (norm(monedaMulta) === '' || norm(monedaSueldo) === '' || norm(monedaMulta) !== norm(monedaSueldo)) {
    throw new DisciplinaError(
      'MONEDA_DISTINTA',
      `LA MONEDA (${norm(monedaMulta) || '?'}) NO COINCIDE CON LA DEL SUELDO (${norm(monedaSueldo) || '?'})`,
    );
  }
}
