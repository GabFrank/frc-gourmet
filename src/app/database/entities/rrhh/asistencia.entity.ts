import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Turno } from './turno.entity';
import { Usuario } from '../personas/usuario.entity';
import { AsistenciaEstado } from './asistencia-estado.enum';

@Entity('asistencias')
@Index(['funcionario', 'fecha'])
export class Asistencia extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => Turno, { nullable: true })
  @JoinColumn({ name: 'turno_id' })
  turno?: Turno;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ name: 'hora_entrada', nullable: true })
  horaEntrada?: string;

  @Column({ name: 'hora_salida', nullable: true })
  horaSalida?: string;

  @Column({
    type: 'text',
    enum: AsistenciaEstado,
    default: AsistenciaEstado.PRESENTE,
  })
  estado!: AsistenciaEstado;

  @Column({ name: 'minutos_tardanza', type: 'integer', default: 0 })
  minutosTardanza!: number;

  @Column({
    name: 'horas_trabajadas',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  horasTrabajadas?: number;

  @Column({ default: false })
  justificada!: boolean;

  @Column({ nullable: true })
  observacion?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'registrado_por_id' })
  registradoPor?: Usuario;
}
