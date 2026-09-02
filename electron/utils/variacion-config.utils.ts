import { DataSource } from 'typeorm';
import { Producto } from '../../src/app/database/entities/productos/producto.entity';
import { PdvConfig } from '../../src/app/database/entities/ventas/pdv-config.entity';

/**
 * Configuración de venta de un producto ELABORADO_CON_VARIACION.
 *
 * Vivía sólo en `PdvConfig` (`pizza_max_sabores` / `pizza_estrategia_precio`),
 * o sea una regla única para todo el local: la pizza admite mitad y mitad, la
 * milanesa con variación no, y ambas heredaban lo mismo. Desde 2026-08 el
 * producto puede sobreescribirla (`max_variaciones_simultaneas`,
 * `estrategia_precio_variacion`); `null` = heredar el global.
 *
 * Fuente única para el PdV desktop, la PWA mobile y la carta online.
 */
export type EstrategiaPrecioVariacion = 'MAYOR_PRECIO' | 'PROMEDIO';

export interface VariacionConfig {
  /** Máximo de variaciones (sabores) combinables en un mismo ítem. Mínimo 1. */
  maxSabores: number;
  estrategia: EstrategiaPrecioVariacion;
  /** true si el valor sale del producto y no del global. */
  personalizada: boolean;
}

const DEFAULTS: VariacionConfig = { maxSabores: 2, estrategia: 'MAYOR_PRECIO', personalizada: false };

function normalizarEstrategia(valor: any): EstrategiaPrecioVariacion | null {
  const estrategia = String(valor || '').toUpperCase();
  if (estrategia === 'PROMEDIO') return 'PROMEDIO';
  if (estrategia === 'MAYOR_PRECIO') return 'MAYOR_PRECIO';
  return null;
}

/** Config global del PdV (fallback de todos los productos sin override). */
export async function getVariacionConfigGlobal(dataSource: DataSource): Promise<VariacionConfig> {
  try {
    const cfg = await dataSource.getRepository(PdvConfig).findOne({ where: {}, order: { id: 'ASC' } });
    return {
      maxSabores: Math.max(1, Number(cfg?.pizzaMaxSabores) || DEFAULTS.maxSabores),
      estrategia: normalizarEstrategia(cfg?.pizzaEstrategiaPrecio) || DEFAULTS.estrategia,
      personalizada: false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Resuelve la config de un producto: override propio si lo tiene, si no el
 * global. Acepta el id o la entidad ya cargada (evita una consulta).
 * `global` permite reutilizar la config global cuando se resuelven varios
 * productos en la misma pasada.
 */
export async function getVariacionConfig(
  dataSource: DataSource,
  producto: Producto | number | null | undefined,
  global?: VariacionConfig,
): Promise<VariacionConfig> {
  const base = global || (await getVariacionConfigGlobal(dataSource));
  if (producto == null) return base;

  let entidad: any = producto;
  if (typeof producto === 'number') {
    try {
      entidad = await dataSource.getRepository(Producto).findOne({ where: { id: producto } });
    } catch {
      entidad = null;
    }
  }
  if (!entidad) return base;

  const maxProducto = Number(entidad.maxVariacionesSimultaneas);
  const estrategiaProducto = normalizarEstrategia(entidad.estrategiaPrecioVariacion);
  const maxSabores = Number.isFinite(maxProducto) && maxProducto >= 1 ? Math.floor(maxProducto) : base.maxSabores;

  return {
    maxSabores,
    estrategia: estrategiaProducto || base.estrategia,
    personalizada: maxSabores !== base.maxSabores || !!estrategiaProducto,
  };
}
