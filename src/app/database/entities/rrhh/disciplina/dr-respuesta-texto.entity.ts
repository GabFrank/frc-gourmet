import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Funcionario } from '../funcionario.entity';
import { DrPeriodo } from './dr-periodo.entity';
import { DrEncuestaPregunta } from './dr-encuesta-pregunta.entity';
import { drNuevoUuid } from './dr-uuid';

/**
 * Respuesta de texto libre de una encuesta. ANONIMATO: sin autor, sin hora, no
 * hereda BaseModel, id UUID aleatorio. Al cerrar el período se reescriben en
 * orden aleatorio.
 */
@Entity('dr_respuesta_texto')
@Index('IDX_dr_respuesta_texto_periodo_eval', ['periodo', 'evaluado'])
export class DrRespuestaTexto {
  @PrimaryColumn({ type: 'varchar', length: 36 })
  id!: string;

  @ManyToOne(() => DrPeriodo, { nullable: false })
  @JoinColumn({ name: 'periodo_id' })
  periodo!: DrPeriodo;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'evaluado_id' })
  evaluado!: Funcionario;

  @ManyToOne(() => DrEncuestaPregunta, { nullable: false })
  @JoinColumn({ name: 'pregunta_id' })
  pregunta!: DrEncuestaPregunta;

  @Column({ type: 'text' })
  texto!: string;

  @BeforeInsert()
  asignarId(): void {
    if (!this.id) this.id = drNuevoUuid();
  }
}
