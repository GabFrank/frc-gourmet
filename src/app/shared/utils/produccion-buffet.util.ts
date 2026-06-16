/**
 * Escalado de insumos para una producción (cargar las cubas del buffet).
 * Lógica PURA y testeable. Espeja la fórmula de descuento por receta usada en
 * ventas (processReceta): cantidad por rendimiento, escalada a lo producido y
 * ajustada por el % de aprovechamiento (mermas).
 */

export interface IngredienteRecetaLike {
  ingredienteId: number;
  cantidad: number; // cantidad del ingrediente para 1 rendimiento de la receta
  unidad: string;
  porcentajeAprovechamiento?: number | null; // 100 = sin merma
}

export interface IngredienteProduccionCalc {
  ingredienteId: number;
  cantidadUsada: number;
  unidad: string;
}

export function escalarProduccion(
  ingredientes: IngredienteRecetaLike[],
  rendimiento: number,
  cantidadProducida: number,
): IngredienteProduccionCalc[] {
  const rend = Number(rendimiento);
  const producido = Number(cantidadProducida) || 0;
  // rendimiento inválido (<=0) → factor 0 (no consumir, evita escalados erróneos).
  const factor = Number.isFinite(rend) && rend > 0 ? producido / rend : 0;

  return (ingredientes || []).map((ing) => {
    const aprov = Number(ing.porcentajeAprovechamiento);
    const aprovFactor = Number.isFinite(aprov) && aprov > 0 ? aprov / 100 : 1;
    const cantidadUsada = (Number(ing.cantidad) || 0) * factor / aprovFactor;
    return {
      ingredienteId: ing.ingredienteId,
      cantidadUsada: Math.round(cantidadUsada * 1000) / 1000,
      unidad: ing.unidad,
    };
  });
}
