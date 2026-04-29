import { Column, Entity, ManyToOne, JoinColumn, OneToMany, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';

@Entity('vacaciones')
@Index(['funcionario', 'anioServicio'])
export class Vacacion extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ name: 'anio_servicio', type: 'int' })
  anioServicio!: number;

  @Column({ name: 'dias_generados', type: 'int' })
  diasGenerados!: number;

  @Column({ name: 'dias_gozados', type: 'int', default: 0 })
  diasGozados!: number;

  @Column({ name: 'fecha_corte', type: 'date' })
  fechaCorte!: Date;

  @Column({ nullable: true })
  observacion?: string;

  @Column({ default: false })
  prescrita!: boolean;

  @OneToMany('VacacionPeriodo', 'vacacion')
  periodos?: any[];
}
