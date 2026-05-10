import { Column, Entity, JoinColumn, ManyToOne, OneToMany, OneToOne } from 'typeorm';
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

  @Column({ nullable: true })
  fecha?: Date;

  @Column({ nullable: true })
  observaciones?: string;

  @OneToMany('ConteoDetalle', 'conteo', { cascade: true })
  detalles!: any[];

  @OneToOne('Caja', 'conteoApertura')
  cajaApertura?: any;

  @OneToOne('Caja', 'conteoCierre')
  cajaCierre?: any;

  // F5: device tracking — dispositivo donde se hizo el conteo.
  @ManyToOne('Dispositivo', { nullable: true })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo?: any;
}
