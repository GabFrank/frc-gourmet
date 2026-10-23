import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { DrEncuesta } from './dr-encuesta.entity';
import { DrPreguntaTipo } from './dr-pregunta-tipo.enum';

@Entity('dr_encuesta_pregunta')
export class DrEncuestaPregunta extends BaseModel {
  @ManyToOne(() => DrEncuesta, (e) => e.preguntas, { nullable: false })
  @JoinColumn({ name: 'encuesta_id' })
  encuesta!: DrEncuesta;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'text', enum: DrPreguntaTipo, default: DrPreguntaTipo.ESCALA })
  tipo!: DrPreguntaTipo;

  @Column({ name: 'escala_min', type: 'integer', default: 1 })
  escalaMin!: number;

  @Column({ name: 'escala_max', type: 'integer', nullable: true })
  escalaMax?: number | null;

  @Column({ default: true })
  obligatoria!: boolean;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
