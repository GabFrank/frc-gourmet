/**
 * Cálculo de precio y proporciones de un producto ELABORADO_CON_VARIACION
 * (pizza mitad y mitad, etc.). Extraído del diálogo para poder testearlo:
 * son las reglas que definen lo que se le cobra al cliente.
 *
 * Réplica de lo que hace el PdV desktop (`seleccionar-variacion-dialog` +
 * `addVariacionItem` de `pdv.component.ts`).
 */

/** Un sabor participando de la línea, con su personalización ya resuelta. */
export interface SaborCalculo {
  /** precio de referencia del sabor en esa presentación */
  precio: number;
  /** costo calculado del sabor */
  costo: number;
  /** suma de adicionales del sabor, por unidad y SIN ponderar */
  adicTotal: number;
  /** parte de la pizza que ocupa (0.5 = mitad) */
  proporcion: number;
}

export interface TotalesVariacion {
  /** precio base de la línea según la estrategia configurada */
  precioCalculado: number;
  /** adicionales ya ponderados por proporción */
  totalAdicionales: number;
  /** costo ponderado por proporción */
  costoCalculado: number;
}

/** Reparte 1 entre `n` sabores en partes iguales. */
export function proporcionesIguales(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [1];
  const p = Number((1 / n).toFixed(4));
  return Array.from({ length: n }, () => p);
}

/** ¿Todas las proporciones son (prácticamente) iguales? */
export function sonProporcionesIguales(proporciones: number[]): boolean {
  if (proporciones.length <= 1) return true;
  return proporciones.every((p) => Math.abs(p - proporciones[0]) < 0.001);
}

/**
 * Mueve `deltaPct` puntos porcentuales al sabor `idx` y compensa el resto para
 * que la suma se mantenga en 1. El sabor movido queda topado entre 10% y 90%, y
 * ninguno baja de 5%. Devuelve un array nuevo (no muta el original).
 */
export function ajustarProporcion(proporciones: number[], idx: number, deltaPct: number): number[] {
  const n = proporciones.length;
  if (n <= 1 || idx < 0 || idx >= n) return [...proporciones];
  const actualPct = Math.round(proporciones[idx] * 100);
  const nuevoPct = Math.min(90, Math.max(10, actualPct + deltaPct));
  const realDelta = nuevoPct - actualPct;
  if (realDelta === 0) return [...proporciones];
  const compensacion = -realDelta / (n - 1) / 100;
  return proporciones.map((p, i) =>
    i === idx ? nuevoPct / 100 : Math.max(0.05, p + compensacion),
  );
}

/**
 * Etiqueta de la porción de un sabor: fracción (`1/2`) cuando el reparto es en
 * partes iguales, porcentaje (`60%`) cuando el usuario lo ajustó. Vacía si hay
 * un solo sabor.
 */
export function etiquetaProporcion(proporciones: number[], idx: number): string {
  const n = proporciones.length;
  if (n <= 1) return '';
  if (sonProporcionesIguales(proporciones)) return `1/${n}`;
  return `${Math.round(proporciones[idx] * 100)}%`;
}

/**
 * Totales de la línea.
 *
 * - **Precio base**: `PROMEDIO` promedia los precios de los sabores elegidos;
 *   cualquier otro valor (default `MAYOR_PRECIO`) toma el más caro. No se
 *   pondera: el tamaño de la pizza es el mismo se divida como se divida.
 * - **Adicionales y costo**: SÍ se ponderan por proporción — un extra cargado en
 *   media pizza cuesta la mitad, igual que el desktop.
 */
export function calcularTotalesVariacion(
  sabores: SaborCalculo[],
  estrategia: string,
): TotalesVariacion {
  if (sabores.length === 0) {
    return { precioCalculado: 0, totalAdicionales: 0, costoCalculado: 0 };
  }
  const precios = sabores.map((s) => s.precio);
  const precioCalculado =
    estrategia === 'PROMEDIO'
      ? precios.reduce((a, b) => a + b, 0) / precios.length
      : Math.max(...precios);
  const totalAdicionales = sabores.reduce((sum, s) => sum + s.adicTotal * s.proporcion, 0);
  const costoCalculado = sabores.reduce((sum, s) => sum + s.costo * s.proporcion, 0);
  return { precioCalculado, totalAdicionales, costoCalculado };
}
