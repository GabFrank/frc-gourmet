import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import type { Combo } from './combo.entity';
import type { ProductoPresentacion } from './producto-presentacion.entity';
import { BaseModel } from '../../base.entity';

/**
 * Entity representing an item within a combo
 */
@Entity('combo_items')
export class ComboItem extends BaseModel {
  @Column({ name: 'combo_id' })
  comboId!: number;

  @ManyToOne('Combo', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'combo_id' })
  combo!: Combo;

  @Column({ name: 'producto_presentacion_id' })
  productoPresentacionId!: number;

  @ManyToOne('ProductoPresentacion', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_presentacion_id' })
  productoPresentacion!: ProductoPresentacion;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  cantidad!: number;

  @Column({ default: false })
  esOpcional!: boolean; // Si el cliente puede elegir no incluir este item

  @Column({ default: false })
  permiteVariaciones!: boolean; // Si se pueden elegir variaciones de este producto

  @Column({ default: 0 })
  orden!: number; // Orden de presentación en el combo

  @Column({ default: true })
  activo!: boolean;
} 