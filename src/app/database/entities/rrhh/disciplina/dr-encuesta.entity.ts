import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { DrGrupo } from './dr-grupo.entity';

@Entity('dr_encuesta')
export class DrEncuesta extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @ManyToOne(() => DrGrupo, { nullable: true })
  @JoinColumn({ name: 'grupo_id' })
  grupo?: DrGrupo | null;

  /** Día de apertura (1=lunes ... 7=domingo). */
  @Column({ name: 'dia_apertura', type: 'integer', nullable: true })
  diaApertura?: number | null;

  /** Hora de apertura 'HH:MM'. */
  @Column({ name: 'hora_apertura', type: 'varchar', length: 5, nullable: true })
  horaApertura?: string | null;

  @Column({ name: 'horas_abierta', type: 'integer', default: 24 })
  horasAbierta!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('DrEncuestaPregunta', 'encuesta')
  preguntas?: any[];
}
