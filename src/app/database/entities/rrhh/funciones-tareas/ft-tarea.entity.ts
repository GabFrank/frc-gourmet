import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { Usuario } from '../../personas/usuario.entity';
import { FtPlantillaTarea } from './ft-plantilla-tarea.entity';
import { FtEstadoTarea, FtOrigenTarea } from './ft.enums';
import { FtTareaItem } from './ft-tarea-item.entity';

/**
 * Instancia de una tarea para un funcionario y un día (día de entrada al turno).
 * UNIQUE (plantilla, funcionario, fecha, evento_ref) = idempotencia del motor; evento_ref es ''
 * cuando no aplica para que el UNIQUE funcione igual en SQLite y Postgres.
 */
@Entity('ft_tarea')
@Index('UQ_ft_tarea_instancia', ['plantilla', 'funcionario', 'fecha', 'eventoRef'], { unique: true })
export class FtTarea extends BaseModel {
  @ManyToOne(() => FtPlantillaTarea, { nullable: true })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla?: FtPlantillaTarea | null;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'date' })
  fecha!: string;

  @Column()
  inicio!: Date;

  @Column()
  vence!: Date;

  @Column({ type: 'text', enum: FtEstadoTarea, default: FtEstadoTarea.PENDIENTE })
  estado!: FtEstadoTarea;

  // Snapshot de la plantilla al generar
  @Column({ type: 'text' })
  titulo!: string;

  @Column({ default: false })
  critica!: boolean;

  @Column({ type: 'integer', default: 1 })
  peso!: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'hecha_por_id' })
  hechaPor?: Usuario | null;

  @Column({ name: 'hecha_en', nullable: true })
  hechaEn?: Date;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'verificada_por_id' })
  verificadaPor?: Usuario | null;

  @Column({ name: 'verificada_en', nullable: true })
  verificadaEn?: Date;

  @Column({ type: 'text', nullable: true })
  nota?: string | null;

  @Column({ name: 'evidencia_url', type: 'text', nullable: true })
  evidenciaUrl?: string | null;

  @Column({ name: 'motivo_no_aplica', type: 'text', nullable: true })
  motivoNoAplica?: string | null;

  @Column({ name: 'nivel_escalado', type: 'integer', default: 0 })
  nivelEscalado!: number;

  @Column({ type: 'text', enum: FtOrigenTarea, default: FtOrigenTarea.MOTOR })
  origen!: FtOrigenTarea;

  @Column({ name: 'evento_ref', type: 'varchar', length: 60, default: '' })
  eventoRef!: string;

  @OneToMany(() => FtTareaItem, (i) => i.tarea)
  items?: FtTareaItem[];
}
