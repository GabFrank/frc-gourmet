import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing the details of a money count
 */
@Entity('conteos_detalles')
export class ConteoDetalle extends BaseModel {
  @ManyToOne('Conteo', 'detalles', { nullable: false })
  @JoinColumn({ name: 'conteo_id' })
  conteo!: any;

  @ManyToOne('MonedaBillete', 'conteoDetalles', { nullable: false })
  @JoinColumn({ name: 'moneda_billete_id' })
  monedaBillete!: any;

  @Column('int')
  cantidad!: number;

  @Column({ default: true })
  activo!: boolean;
}
