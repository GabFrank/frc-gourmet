import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Vacacion } from './vacacion.entity';
import { Usuario } from '../personas/usuario.entity';

export enum VacacionPeriodoEstado {
  PROGRAMADA = 'PROGRAMADA',
  EN_CURSO = 'EN_CURSO',
  GOZADA = 'GOZADA',
  CANCELADA = 'CANCELADA',
}

@Entity('vacacion_periodos')
export class VacacionPeriodo extends BaseModel {
  @ManyToOne(() => Vacacion)
  @JoinColumn({ name: 'vacacion_id' })
  vacacion!: Vacacion;

  @Column({ name: 'fecha_desde', type: 'date' })
  fechaDesde!: Date;

  @Column({ name: 'fecha_hasta', type: 'date' })
  fechaHasta!: Date;

  @Column({ name: 'dias_usados', type: 'int' })
  diasUsados!: number;

  @Column({
    type: 'text',
    enum: VacacionPeriodoEstado,
    default: VacacionPeriodoEstado.PROGRAMADA,
  })
  estado!: VacacionPeriodoEstado;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'autorizado_por_id' })
  autorizadoPor?: Usuario;

  @Column({ name: 'asistencias_generadas', default: false })
  asistenciasGeneradas!: boolean;

  @Column({ nullable: true })
  observacion?: string;
}
