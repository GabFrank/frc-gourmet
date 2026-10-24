import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { Usuario } from '../../personas/usuario.entity';
import { DrCriterio } from './dr-criterio.entity';

@Entity('dr_puntaje_criterio')
@Index('UQ_dr_puntaje_criterio_fecha_func_crit', ['fecha', 'funcionario', 'criterio'], { unique: true })
export class DrPuntajeCriterio extends BaseModel {
  @Column({ type: 'date' })
  fecha!: Date;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => DrCriterio, { nullable: false })
  @JoinColumn({ name: 'criterio_id' })
  criterio!: DrCriterio;

  @Column({ type: 'integer', default: 0 })
  valor!: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'auditor_id' })
  auditor?: Usuario | null;
}
