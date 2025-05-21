import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Combo } from './combo.entity';
import type { Presentacion } from './presentacion.entity';

/**
 * Entity representing a combo item
 */
@Entity('producto_combo_items')
export class ComboItem extends BaseModel {
  @Column({ name: 'combo_id' })
  comboId!: number;

  @ManyToOne('Combo', 'items', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'combo_id' })
  combo!: Combo;

  @Column({ name: 'presentacion_id' })
  presentacionId!: number;

  @ManyToOne('Presentacion', 'comboItems', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1 })
  cantidad!: number;

  @Column({ default: true })
  activo!: boolean;
}
