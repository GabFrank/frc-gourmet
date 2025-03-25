import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { ComboItem } from './combo-item.entity';
import type { PrecioVenta } from './precio-venta.entity';

/**
 * Entity representing a product combo
 */
@Entity('producto_combos')
export class Combo extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('ComboItem', 'combo')
  items!: ComboItem[];

  @OneToMany('PrecioVenta', 'combo')
  preciosVenta!: PrecioVenta[];
}
