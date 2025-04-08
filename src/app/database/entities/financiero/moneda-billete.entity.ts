import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';

/**
 * Entity representing a specific denomination of currency (bill or coin)
 */
@Entity('monedas_billetes')
export class MonedaBillete extends BaseModel {
  @ManyToOne(() => Moneda, { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column('decimal', { precision: 12, scale: 2 })
  valor!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true })
  image_path?: string;

  @OneToMany('ConteoDetalle', 'monedaBillete')
  conteoDetalles!: any[];
}
