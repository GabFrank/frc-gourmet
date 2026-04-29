import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Asistencia } from './asistencia.entity';
import { Usuario } from '../personas/usuario.entity';
import { HoraExtraTipo } from './hora-extra-tipo.enum';

@Entity('horas_extra')
export class HoraExtra extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'date' })
  fecha!: Date;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  horas!: number;

  @Column({
    type: 'text',
    enum: HoraExtraTipo,
    default: HoraExtraTipo.DIURNA,
  })
  tipo!: HoraExtraTipo;

  @Column({
    name: 'recargo_porcentaje',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 50,
  })
  recargoPorcentaje!: number;

  @Column({
    name: 'monto_calculado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  montoCalculado!: number;

  @ManyToOne(() => Asistencia, { nullable: true })
  @JoinColumn({ name: 'asistencia_id' })
  asistencia?: Asistencia;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por_id' })
  autorizadoPor?: Usuario;

  @Column({ nullable: true })
  observacion?: string;

  @Column({ default: false })
  anulada!: boolean;
}
