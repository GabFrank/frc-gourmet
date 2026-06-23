/**
 * Cálculo de cobro de buffet por peso. Lógica PURA (sin Electron/TypeORM) para
 * poder testearla con ts-node. La usa el PdV (diálogo de pesaje) y se vuelve a
 * validar en el backend al cobrar.
 *
 * Modelo:
 *   neto       = max(bruto - tara, 0)            (gramos)
 *   subtotal   = (neto / 1000) * precioPorKg
 *   total      = clamp(subtotal, precioMinimo, precioMaximo)
 *   aplicoLibre = (precioMaximo != null && subtotal >= precioMaximo)
 *
 * El tope "buffet libre" y el mínimo se aplican en software (NO en la balanza),
 * para preservar SIEMPRE el peso neto real (métricas). Para que el resto del
 * sistema calcule el total con su fórmula universal
 * `precioVentaUnitario * cantidad`, se expone `precioVentaUnitarioEfectivo`
 * (= total / netoKg) y `cantidadKg` (= netoKg).
 */

export interface BuffetCobroParams {
  pesoBrutoGramos: number;
  taraGramos?: number | null;
  precioPorKg: number;
  precioMinimo?: number | null;
  precioMaximo?: number | null;
}

export interface BuffetCobroResult {
  pesoNetoGramos: number;
  cantidadKg: number;
  subtotal: number;
  total: number;
  aplicoLibre: boolean;
  /** Precio por kg "efectivo" tal que efectivo * cantidadKg = total. */
  precioVentaUnitarioEfectivo: number;
}

function num(v: number | null | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function calcularCobroBuffet(params: BuffetCobroParams): BuffetCobroResult {
  const bruto = num(params.pesoBrutoGramos);
  const tara = num(params.taraGramos);
  const precioPorKg = num(params.precioPorKg);
  const precioMinimo = params.precioMinimo == null ? null : num(params.precioMinimo);
  const precioMaximo = params.precioMaximo == null ? null : num(params.precioMaximo);

  const neto = Math.max(bruto - tara, 0);
  const cantidadKg = neto / 1000;
  const subtotal = cantidadKg * precioPorKg;

  let total = subtotal;
  const aplicoLibre = precioMaximo != null && subtotal >= precioMaximo;
  if (aplicoLibre) {
    total = precioMaximo as number;
  } else if (precioMinimo != null && total < precioMinimo) {
    total = precioMinimo;
  }

  const precioVentaUnitarioEfectivo = cantidadKg > 0 ? total / cantidadKg : total;

  return {
    pesoNetoGramos: neto,
    cantidadKg,
    subtotal,
    total,
    aplicoLibre,
    precioVentaUnitarioEfectivo,
  };
}
