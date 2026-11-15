import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/** A dónde va el costo de una línea de compra (docs/planes/PLAN-clasificacion-items-compras.md). */
export type CompraItemDestino = 'CMV' | 'GASTO_OPERATIVO' | 'REVENTA';
export const COMPRA_ITEM_DESTINOS: CompraItemDestino[] = ['CMV', 'GASTO_OPERATIVO', 'REVENTA'];

/**
 * Clase de ítem de compra (insumo de producción, bebida de reventa, limpieza…).
 * Tabla configurable: la semilla trae las 7 de Don Franco, pero cada instalación
 * las edita. Se asigna en subfamilia y producto; la línea de compra guarda la suya.
 */
@Entity('compra_item_clase')
export class CompraItemClase extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @Column({ type: 'varchar', length: 20 })
  destino!: CompraItemDestino;

  /** Solo sugiere `controlaStock` al crear un producto de esta clase; no cambia nada solo. */
  @Column({ name: 'controla_stock_por_defecto', type: 'boolean', default: true })
  controlaStockPorDefecto!: boolean;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;
}
