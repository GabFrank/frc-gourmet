import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';

/**
 * Entity representing which currencies are enabled for cash register operations
 * This determines which currencies will appear in conteo forms
 */
@Entity('cajas_monedas')
export class CajaMoneda extends BaseModel {
  @ManyToOne(() => Moneda, { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ default: false })
  predeterminado!: boolean;

  @Column({ default: true })
  activo!: boolean;

  @Column('varchar', { length: 10, nullable: true })
  orden?: string;
}
