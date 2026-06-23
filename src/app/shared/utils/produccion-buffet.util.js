"use strict";
/**
 * Escalado de insumos para una producción (cargar las cubas del buffet).
 * Lógica PURA y testeable. Espeja la fórmula de descuento por receta usada en
 * ventas (processReceta): cantidad por rendimiento, escalada a lo producido y
 * ajustada por el % de aprovechamiento (mermas).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escalarProduccion = void 0;
function escalarProduccion(ingredientes, rendimiento, cantidadProducida) {
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
exports.escalarProduccion = escalarProduccion;
//# sourceMappingURL=produccion-buffet.util.js.map