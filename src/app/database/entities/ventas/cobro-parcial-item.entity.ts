import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { CobroParcial } from './cobro-parcial.entity';
import type { VentaItem } from './venta-item.entity';

/**
 * Imputación en bruto de una ronda de cobro parcial sobre un ítem.
 *
 * `brutoCubierto` es la porción del `netoBrutoItem` (precio con descuento propio
 * del ítem, SIN descuento global) que esta ronda cubrió. La suma de las
 * imputaciones activas de un ítem = `VentaItem.montoCubierto` (cache).
 *
 * Se guarda en bruto a propósito: aplicar/cambiar el descuento global nunca toca
 * lo ya cubierto (ver `docs/PLAN-COBRO-PARCIAL-POR-ITEMS.md`).
 */
@Entity('cobro_parcial_items')
export class CobroParcialItem extends BaseModel {
  @ManyToOne('CobroParcial', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cobro_parcial_id' })
  cobroParcial!: CobroParcial;

  @ManyToOne('VentaItem')
  @JoinColumn({ name: 'venta_item_id' })
  ventaItem!: VentaItem;

  @Column({ name: 'bruto_cubierto', type: 'decimal', precision: 10, scale: 2 })
  brutoCubierto!: number;

  // Cantidad de unidades cubiertas (si se cobró por cantidad); informativo.
  @Column({ name: 'cantidad', type: 'decimal', precision: 10, scale: 3, nullable: true })
  cantidad?: number;
}
