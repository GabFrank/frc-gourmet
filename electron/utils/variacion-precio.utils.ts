import { DataSource } from 'typeorm';
import { PrecioVenta } from '../../src/app/database/entities/productos/precio-venta.entity';
import { RecetaPresentacion } from '../../src/app/database/entities/productos/receta-presentacion.entity';

/**
 * Rango de precios de un producto ELABORADO_CON_VARIACION (pizza, milanesa…).
 *
 * El precio de una variación vive en `PrecioVenta.receta_presentacion_id` desde
 * el refactor "cada variación su propia receta" (2026-07). Las listas del PdV,
 * del buscador y de los atajos seguían resolviéndolo por `PrecioVenta.receta_id`
 * (o peor, por el 1:1 legacy `receta.producto_id`), así que devolvían `null` y la
 * UI mostraba `0`. Este helper es la fuente única para "desde / hasta".
 */
export interface RangoPrecioVariacion {
  /** Precio de la variación más barata (0 si no hay ninguna con precio). */
  precioDesde: number;
  /** Precio de la variación más cara. */
  precioHasta: number;
  /** PrecioVenta crudo de la variación más barata — sirve de `principalPrecio`. */
  precioReferencia: PrecioVenta | null;
  /** Combinaciones (sabor × presentación) con precio vigente. */
  variacionesCount: number;
  /** Sabores distintos con al menos un precio vigente. */
  saboresCount: number;
  /** Presentaciones distintas con al menos un precio vigente. */
  presentacionesCount: number;
  /** true si el rango se resolvió con el esquema viejo (precio colgado de la receta). */
  legacy: boolean;
}

function vacio(): RangoPrecioVariacion {
  return {
    precioDesde: 0,
    precioHasta: 0,
    precioReferencia: null,
    variacionesCount: 0,
    saboresCount: 0,
    presentacionesCount: 0,
    legacy: false,
  };
}

/** Precio vigente de una variación: el principal, si no el primero activo. */
function pickPrecio(precios: PrecioVenta[] | undefined): PrecioVenta | null {
  if (!precios?.length) return null;
  return precios.find((pv) => pv.activo && pv.principal) || precios.find((pv) => pv.activo) || precios[0] || null;
}

/**
 * Calcula el rango de precios de varios productos con variación en una sola
 * consulta (evita el N+1 de las listas). Devuelve un Map productoId → rango;
 * los productos sin ninguna variación con precio quedan con el rango en 0.
 */
export async function getRangosPrecioVariacion(
  dataSource: DataSource,
  productoIds: number[],
): Promise<Map<number, RangoPrecioVariacion>> {
  const resultado = new Map<number, RangoPrecioVariacion>();
  const ids = Array.from(new Set((productoIds || []).filter((id) => Number.isFinite(id) && id > 0)));
  if (!ids.length) return resultado;
  for (const id of ids) resultado.set(id, vacio());

  // Variaciones activas (sabor activo + presentación activa) con sus precios vigentes.
  const variaciones = await dataSource
    .getRepository(RecetaPresentacion)
    .createQueryBuilder('rp')
    .innerJoinAndSelect('rp.sabor', 'sabor')
    .innerJoinAndSelect('rp.presentacion', 'presentacion')
    .innerJoinAndSelect('sabor.producto', 'producto')
    .leftJoinAndSelect('rp.preciosVenta', 'pv', 'pv.activo = :precioActivo', { precioActivo: true })
    .leftJoinAndSelect('pv.moneda', 'moneda')
    .where('producto.id IN (:...ids)', { ids })
    .andWhere('rp.activo = :activo', { activo: true })
    .andWhere('sabor.activo = :activo', { activo: true })
    .andWhere('presentacion.activo = :activo', { activo: true })
    .getMany();

  const acumulado = new Map<number, { precios: PrecioVenta[]; sabores: Set<number>; presentaciones: Set<number> }>();
  for (const rp of variaciones as any[]) {
    const productoId = rp.sabor?.producto?.id;
    if (!productoId) continue;
    const precio = pickPrecio(rp.preciosVenta);
    if (!precio) continue;
    let acc = acumulado.get(productoId);
    if (!acc) {
      acc = { precios: [], sabores: new Set<number>(), presentaciones: new Set<number>() };
      acumulado.set(productoId, acc);
    }
    acc.precios.push(precio);
    if (rp.sabor?.id) acc.sabores.add(rp.sabor.id);
    if (rp.presentacion?.id) acc.presentaciones.add(rp.presentacion.id);
  }

  for (const [productoId, acc] of acumulado) {
    const ordenados = [...acc.precios].sort((a, b) => Number(a.valor) - Number(b.valor));
    resultado.set(productoId, {
      precioDesde: Number(ordenados[0].valor),
      precioHasta: Number(ordenados[ordenados.length - 1].valor),
      precioReferencia: ordenados[0],
      variacionesCount: ordenados.length,
      saboresCount: acc.sabores.size,
      presentacionesCount: acc.presentaciones.size,
      legacy: false,
    });
  }

  // Fallback para datos previos al refactor: el precio todavía cuelga de la
  // receta de la variación (`PrecioVenta.receta_id` + `receta.productoVariacion`).
  const sinPrecio = ids.filter((id) => !acumulado.has(id));
  for (const productoId of sinPrecio) {
    const precios = await dataSource
      .getRepository(PrecioVenta)
      .createQueryBuilder('pv')
      .leftJoinAndSelect('pv.moneda', 'moneda')
      .innerJoin('pv.receta', 'receta')
      .where('receta.producto_variacion_id = :productoId', { productoId })
      .andWhere('pv.activo = :activo', { activo: true })
      .getMany();
    if (!precios.length) continue;
    const ordenados = [...precios].sort((a, b) => Number(a.valor) - Number(b.valor));
    resultado.set(productoId, {
      precioDesde: Number(ordenados[0].valor),
      precioHasta: Number(ordenados[ordenados.length - 1].valor),
      precioReferencia: ordenados[0],
      variacionesCount: ordenados.length,
      saboresCount: 0,
      presentacionesCount: 0,
      legacy: true,
    });
  }

  return resultado;
}
