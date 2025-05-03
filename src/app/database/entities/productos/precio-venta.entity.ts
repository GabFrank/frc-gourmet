import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Presentacion } from './presentacion.entity';
import type { PresentacionSabor } from './presentacion-sabor.entity';
import type { Combo } from './combo.entity';
import { Moneda } from '../financiero/moneda.entity';
import { TipoPrecio } from '../financiero/tipo-precio.entity';

/**
 * Entity representing a product sale price
 */
@Entity('producto_precios_venta')
export class PrecioVenta extends BaseModel {
  @Column({ name: 'presentacion_id', nullable: true })
  presentacionId?: number;

  @ManyToOne('Presentacion', 'preciosVenta', { nullable: true })
  @JoinColumn({ name: 'presentacion_id' })
  presentacion?: Presentacion;

  @Column({ name: 'presentacion_sabor_id', nullable: true })
  presentacionSaborId?: number;

  @ManyToOne('PresentacionSabor', 'preciosVenta', { nullable: true })
  @JoinColumn({ name: 'presentacion_sabor_id' })
  presentacionSabor?: PresentacionSabor;

  @Column({ name: 'combo_id', nullable: true })
  comboId?: number;

  @ManyToOne('Combo', 'preciosVenta', { nullable: true })
  @JoinColumn({ name: 'combo_id' })
  combo?: Combo;

  @Column({ name: 'moneda_id' })
  monedaId!: number;

  @ManyToOne('Moneda')
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ name: 'tipo_precio_id', nullable: true })
  tipoPrecioId?: number;

  @ManyToOne(() => TipoPrecio, { nullable: true })
  @JoinColumn({ name: 'tipo_precio_id' })
  tipoPrecio?: TipoPrecio;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  principal!: boolean;
}
