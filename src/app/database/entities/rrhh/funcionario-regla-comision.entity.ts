import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { ReglaComision } from './regla-comision.entity';

@Entity('funcionario_regla_comision')
export class FuncionarioReglaComision extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => ReglaComision)
  @JoinColumn({ name: 'regla_comision_id' })
  reglaComision!: ReglaComision;

  @Column({ name: 'fecha_desde', type: 'date' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta?: Date;

  @Column({ default: true })
  activo!: boolean;
}
