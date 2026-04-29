import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Turno } from './turno.entity';

/**
 * Asignacion de un funcionario a un turno con vigencia. Permite historial.
 */
@Entity('funcionario_turnos')
export class FuncionarioTurno extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => Turno)
  @JoinColumn({ name: 'turno_id' })
  turno!: Turno;

  @Column({ name: 'fecha_desde', type: 'date' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'date', nullable: true })
  fechaHasta?: Date;
}
