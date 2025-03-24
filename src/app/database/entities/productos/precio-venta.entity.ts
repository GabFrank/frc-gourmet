import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';
import { Moneda } from '../financiero/moneda.entity';

/**
 * Entity representing a product sale price
 */
@Entity('producto_precios_venta')
export class PrecioVenta extends BaseModel {
  @Column({ name: 'presentacion_id' })
  presentacionId!: number;

  @ManyToOne('Presentacion', 'preciosVenta')
  @JoinColumn({ name: 'presentacion_id' })
  presentacion!: Presentacion;

  @Column({ name: 'moneda_id' })
  monedaId!: number;

  @ManyToOne(() => Moneda, moneda => moneda.preciosVenta)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  principal!: boolean;
} 