/**
 * Tienda online F6: arma las pestañas de la carta con las categorías de la tienda cargadas a
 * mano (docs/planes/PLAN-tienda-online-F6-ux-carta.md). Función pura, sin base, para probarla.
 */

export interface CategoriaTiendaFila {
  id: number;
  nombre: string;
  orden: number;
  activo: boolean;
  /** Asignaciones: producto y su orden dentro de la categoría. */
  productos: Array<{ productoId: number; orden: number }>;
}

export interface CategoriaMenu {
  id: number | string;
  nombre: string;
  productoIds?: number[];
}

export const ID_OTROS_TIENDA = 'OTROS_TIENDA';

/**
 * - Sin ninguna categoría de tienda activa, devuelve las de familia tal cual (como antes de F6).
 * - Solo cuentan los productos que ya salen en la carta (activos, vendibles y online): uno que
 *   deja de estar online desaparece de sus categorías sin borrar la asignación.
 * - Las inactivas y las que quedan vacías no se muestran.
 * - Un producto puede estar en varias; el que no está en ninguna va a «Otros», al final.
 */
export function armarCategoriasTienda(
  categoriasFamilia: CategoriaMenu[],
  productosEnCarta: number[],
  categoriasTienda: CategoriaTiendaFila[],
): CategoriaMenu[] {
  const activas = categoriasTienda.filter((c) => c.activo);
  if (!activas.length) return categoriasFamilia;

  const enCarta = new Set(productosEnCarta);
  const ubicados = new Set<number>();
  const salida: CategoriaMenu[] = [];
  const porOrden = <T extends { orden: number }>(a: T, b: T) => (Number(a.orden) || 0) - (Number(b.orden) || 0);

  for (const c of [...activas].sort((a, b) => porOrden(a, b) || a.id - b.id)) {
    const ids: number[] = [];
    for (const p of [...c.productos].sort(porOrden)) {
      if (enCarta.has(p.productoId) && !ids.includes(p.productoId)) ids.push(p.productoId);
    }
    if (!ids.length) continue;
    ids.forEach((id) => ubicados.add(id));
    salida.push({ id: `tc-${c.id}`, nombre: c.nombre, productoIds: ids });
  }

  const resto = productosEnCarta.filter((id) => !ubicados.has(id));
  if (resto.length) salida.push({ id: ID_OTROS_TIENDA, nombre: 'OTROS', productoIds: resto });
  return salida;
}
