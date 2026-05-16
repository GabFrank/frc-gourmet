import { Pipe, PipeTransform } from '@angular/core';
import { montoEnLetras, montoEnLetrasConPrefijo, MonedaCode } from '../utils/monto-letras.util';

/**
 * Convierte un monto numérico a su representación en letras (español
 * paraguayo), apto para impresión en pagarés, recibos y comprobantes legales.
 *
 * Uso en template:
 *   {{ monto | montoEnLetras }}                 → 'UN MILLÓN ... GUARANIES'
 *   {{ monto | montoEnLetras:'USD' }}           → 'DOS MIL ... CON 50/100 DÓLARES ESTADOUNIDENSES'
 *   {{ monto | montoEnLetras:'PYG':true }}      → 'SON: UN MILLÓN ... GUARANIES'
 *
 * Output siempre UPPERCASE.
 *
 * Es un pipe puro (default) — Angular lo evalúa solo cuando cambia el monto o
 * la moneda, no en cada change detection.
 */
@Pipe({ name: 'montoEnLetras', standalone: true })
export class MontoEnLetrasPipe implements PipeTransform {
  transform(value: number | string | null | undefined, moneda: MonedaCode | string = 'PYG', conPrefijo = false): string {
    if (value == null || value === '') return '';
    const num = typeof value === 'string' ? Number(value) : value;
    if (!isFinite(num)) return '';
    return conPrefijo ? montoEnLetrasConPrefijo(num, moneda) : montoEnLetras(num, moneda);
  }
}
