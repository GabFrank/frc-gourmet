import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Turno laboral. Define horas de entrada/salida y tolerancia de tardanza.
 */
@Entity('turnos')
export class Turno extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ name: 'hora_entrada' })
  horaEntrada!: string; // 'HH:mm'

  @Column({ name: 'hora_salida' })
  horaSalida!: string; // 'HH:mm'

  @Column({ name: 'tolerancia_tardanza_minutos', type: 'integer', default: 5 })
  toleranciaTardanzaMinutos!: number;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;
}
