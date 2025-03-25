import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';
import type { Sabor } from './sabor.entity';
import type { PrecioVenta } from './precio-venta.entity';

/**
 * Entity representing a product presentation with flavor
 */
@Entity('producto_presentaciones_sabores')
export class PresentacionSabor extends BaseModel {
  @Column({ name: 'presentacion_id' })
  presentacionId!: number;

  @ManyToOne('Presentacion', 'presentacionesSabores')
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column({ name: 'sabor_id' })
  saborId!: number;

  @ManyToOne('Sabor', 'presentacionesSabores')
  @JoinColumn({ name: 'sabor_id' })
  sabor!: Sabor;

  @OneToMany('PrecioVenta', 'presentacionSabor')
  preciosVenta!: PrecioVenta[];

  @Column({ default: true })
  activo!: boolean;
}
