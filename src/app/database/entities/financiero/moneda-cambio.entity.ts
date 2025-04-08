import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';

/**
 * Entity representing an exchange rate between two currencies
 */
@Entity('monedas_cambio')
export class MonedaCambio extends BaseModel {
  @ManyToOne(() => Moneda, { nullable: false })
  @JoinColumn({ name: 'moneda_origen_id' })
  monedaOrigen!: Moneda;

  @ManyToOne(() => Moneda, { nullable: false })
  @JoinColumn({ name: 'moneda_destino_id' })
  monedaDestino!: Moneda;

  @Column('decimal', { precision: 12, scale: 4 })
  compraOficial!: number;

  @Column('decimal', { precision: 12, scale: 4 })
  ventaOficial!: number;

  @Column('decimal', { precision: 12, scale: 4 })
  compraLocal!: number;

  @Column('decimal', { precision: 12, scale: 4 })
  ventaLocal!: number;

  @Column({ default: true })
  activo!: boolean;
}
