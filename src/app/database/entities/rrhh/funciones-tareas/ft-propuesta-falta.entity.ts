import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { DrTipoFalta } from '../disciplina/dr-tipo-falta.entity';
import { FtTarea } from './ft-tarea.entity';
import { FtEstadoPropuesta } from './ft.enums';

/** Nivel 3 de escalamiento: sugiere una falta; una persona la registra con dr-registrar-falta. */
@Entity('ft_propuesta_falta')
export class FtPropuestaFalta extends BaseModel {
  @ManyToOne(() => FtTarea, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tarea_id' })
  tarea?: FtTarea | null;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => DrTipoFalta, { nullable: true })
  @JoinColumn({ name: 'dr_tipo_falta_id' })
  tipoFalta?: DrTipoFalta | null;

  @Column({ type: 'text' })
  motivo!: string;

  @Column({ type: 'text', enum: FtEstadoPropuesta, default: FtEstadoPropuesta.PENDIENTE })
  estado!: FtEstadoPropuesta;
}
