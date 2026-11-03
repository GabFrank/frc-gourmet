/**
 * Totales de una factura a partir de sus renglones.
 *
 * Es la **única** implementación de esta cuenta: la usan el diálogo de factura
 * (`recalc()`, para mostrar) y `create-factura` en el servidor (para guardar).
 * Antes el diálogo calculaba y el servidor guardaba lo que le mandaran, así que
 * un comprobante legal podía decir un total que sus renglones no suman (#240).
 *
 * Sin dependencias de Angular: electron la importa igual que a las entidades.
 *
 * Reglas (decididas con Gabriel, 2026-11-02, plan #325 + #240):
 * - Base bruta por tasa (10 / 5 / exenta) = Σ `cantidad × precioUnitario`.
 * - El `descuento` se acota a `[0, bruto]` y se **reparte entre las tres bases**
 *   proporcional a cada una; el residuo de redondeo va a la base mayor. Así la
 *   suma de las bases netas es exactamente el total.
 * - `gravada10/gravada5/exenta` son **netas** del descuento: son la base
 *   imponible. El IVA se liquida sobre ellas (antes se calculaba sobre el bruto
 *   y la factura con descuento declaraba IVA de más).
 * - Redondeo a entero (guaraníes) en bases, IVA y total.
 */

export interface LineaFacturaCalculo {
  cantidad: number | string | null | undefined;
  precioUnitario: number | string | null | undefined;
  ivaTipo: number | string | null | undefined;
}

export interface TotalesFactura {
  /** Total de cada renglón (`cantidad × precioUnitario`, a 2 decimales), en el orden recibido. */
  totalesLinea: number[];
  /** Suma de los renglones antes del descuento. */
  bruto: number;
  /** Descuento efectivamente aplicado (acotado a `[0, bruto]`). */
  descuento: number;
  gravada10: number;
  gravada5: number;
  exenta: number;
  iva10: number;
  iva5: number;
  totalIva: number;
  total: number;
}

/** 10, 5 o 0 (exenta). Cualquier otro valor cuenta como exenta, como hacía el diálogo. */
export function normalizarIvaTipo(ivaTipo: any): 10 | 5 | 0 {
  const n = Number(ivaTipo);
  if (n === 10) return 10;
  if (n === 5) return 5;
  return 0;
}

function redondear2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function calcularTotalesFactura(
  lineas: LineaFacturaCalculo[],
  descuento: number | string | null | undefined,
): TotalesFactura {
  const totalesLinea: number[] = [];
  // `Number()` en todo: los `decimal` llegan como string en Postgres.
  const brutoPorTasa: Record<10 | 5 | 0, number> = { 10: 0, 5: 0, 0: 0 };
  for (const l of lineas || []) {
    const t = redondear2((Number(l?.cantidad) || 0) * (Number(l?.precioUnitario) || 0));
    totalesLinea.push(t);
    brutoPorTasa[normalizarIvaTipo(l?.ivaTipo)] += t;
  }

  const bruto = Math.round(brutoPorTasa[10] + brutoPorTasa[5] + brutoPorTasa[0]);
  const desc = Math.min(Math.max(Math.round(Number(descuento) || 0), 0), Math.max(bruto, 0));
  const total = Math.max(0, bruto - desc);

  const tasas: (10 | 5 | 0)[] = [10, 5, 0];
  const neta: Record<10 | 5 | 0, number> = { 10: 0, 5: 0, 0: 0 };
  const sumaBruta = brutoPorTasa[10] + brutoPorTasa[5] + brutoPorTasa[0];
  if (sumaBruta > 0) {
    for (const k of tasas) {
      neta[k] = Math.round(brutoPorTasa[k] - (desc * brutoPorTasa[k]) / sumaBruta);
    }
    // El residuo de redondeo va a la base mayor (empate: 10 → 5 → exenta).
    const residuo = total - (neta[10] + neta[5] + neta[0]);
    if (residuo !== 0) {
      const mayor = tasas.reduce((a, b) => (brutoPorTasa[b] > brutoPorTasa[a] ? b : a), 10 as 10 | 5 | 0);
      neta[mayor] += residuo;
    }
  }

  const iva10 = Math.round(neta[10] / 11);
  const iva5 = Math.round(neta[5] / 21);
  return {
    totalesLinea,
    bruto,
    descuento: desc,
    gravada10: neta[10],
    gravada5: neta[5],
    exenta: neta[0],
    iva10,
    iva5,
    totalIva: iva10 + iva5,
    total,
  };
}
