import { Column, Entity, OneToMany, OneToOne } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing a money count operation
 */
@Entity('conteos')
export class Conteo extends BaseModel {
  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true })
  tipo?: string;

  @Column({ type: 'datetime', nullable: true })
  fecha?: Date;

  @Column({ nullable: true })
  observaciones?: string;

  @OneToMany('ConteoDetalle', 'conteo', { cascade: true })
  detalles!: any[];

  @OneToOne('Caja', 'conteoApertura')
  cajaApertura?: any;

  @OneToOne('Caja', 'conteoCierre')
  cajaCierre?: any;
}
