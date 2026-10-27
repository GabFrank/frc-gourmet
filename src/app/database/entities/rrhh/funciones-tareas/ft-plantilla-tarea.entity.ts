import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Cargo } from '../cargo.entity';
import { Funcionario } from '../funcionario.entity';
import { Turno } from '../turno.entity';
import { DrGrupo } from '../disciplina/dr-grupo.entity';
import { DrTipoFalta } from '../disciplina/dr-tipo-falta.entity';
import { DrCriterio } from '../disciplina/dr-criterio.entity';
import { FtAncla, FtEvento, FtEventoCaja, FtEvidencia, FtRecurrencia, FtTipoTarea } from './ft.enums';
import { FtPlantillaItem } from './ft-plantilla-item.entity';
import { FtReglaAviso } from './ft-regla-aviso.entity';

/**
 * Plantilla de tarea o checklist. Alcance: cargo, cargo+turno, área (grupo DR) o un funcionario.
 * Una específica puede reemplazar a una general (`reemplazaPlantilla`). Editarla no reescribe
 * las tareas ya generadas (ft_tarea guarda snapshot de título, crítica y peso).
 */
@Entity('ft_plantilla_tarea')
export class FtPlantillaTarea extends BaseModel {
  @Column({ type: 'text' })
  titulo!: string;

  @Column({ type: 'text', nullable: true })
  instrucciones?: string | null;

  @Column({ type: 'text', enum: FtTipoTarea, default: FtTipoTarea.SIMPLE })
  tipo!: FtTipoTarea;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  critica!: boolean;

  @Column({ type: 'integer', default: 1 })
  peso!: number;

  // ── Alcance ──
  @ManyToOne(() => Cargo, { nullable: true })
  @JoinColumn({ name: 'cargo_id' })
  cargo?: Cargo | null;

  @ManyToOne(() => Turno, { nullable: true })
  @JoinColumn({ name: 'turno_id' })
  turno?: Turno | null;

  @ManyToOne(() => Funcionario, { nullable: true })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario?: Funcionario | null;

  @ManyToOne(() => DrGrupo, { nullable: true })
  @JoinColumn({ name: 'dr_grupo_id' })
  grupo?: DrGrupo | null;

  @ManyToOne(() => FtPlantillaTarea, { nullable: true })
  @JoinColumn({ name: 'reemplaza_plantilla_id' })
  reemplazaPlantilla?: FtPlantillaTarea | null;

  // ── Recurrencia ──
  @Column({ type: 'text', enum: FtRecurrencia, default: FtRecurrencia.DIARIA })
  recurrencia!: FtRecurrencia;

  /** Bitmask lunes=1 … domingo=64. */
  @Column({ name: 'dias_semana', type: 'integer', nullable: true })
  diasSemana?: number | null;

  @Column({ name: 'dia_mes', type: 'integer', nullable: true })
  diaMes?: number | null;

  @Column({ name: 'fecha_unica', type: 'date', nullable: true })
  fechaUnica?: string | null;

  @Column({ type: 'text', enum: FtEvento, nullable: true })
  evento?: FtEvento | null;

  /** Eventos de caja: solo PDV o solo MAYOR; null = cualquiera. */
  @Column({ name: 'evento_caja', type: 'text', enum: FtEventoCaja, nullable: true })
  eventoCaja?: FtEventoCaja | null;

  // ── Ventana ──
  @Column({ type: 'text', enum: FtAncla, default: FtAncla.INICIO_TURNO })
  ancla!: FtAncla;

  @Column({ name: 'offset_inicio_min', type: 'integer', default: 0 })
  offsetInicioMin!: number;

  @Column({ name: 'duracion_min', type: 'integer', default: 60 })
  duracionMin!: number;

  /** 'HH:mm' local, solo con ancla HORA_FIJA. */
  @Column({ name: 'hora_fija', type: 'varchar', length: 5, nullable: true })
  horaFija?: string | null;

  // ── Evidencia y verificación ──
  @Column({ type: 'text', enum: FtEvidencia, default: FtEvidencia.NINGUNA })
  evidencia!: FtEvidencia;

  @Column({ name: 'requiere_verificacion', default: false })
  requiereVerificacion!: boolean;

  @ManyToOne(() => Cargo, { nullable: true })
  @JoinColumn({ name: 'verificador_cargo_id' })
  verificadorCargo?: Cargo | null;

  // ── Vínculos con Disciplina (opcionales) ──
  @ManyToOne(() => DrTipoFalta, { nullable: true })
  @JoinColumn({ name: 'dr_tipo_falta_id' })
  tipoFalta?: DrTipoFalta | null;

  @ManyToOne(() => DrCriterio, { nullable: true })
  @JoinColumn({ name: 'dr_criterio_id' })
  criterio?: DrCriterio | null;

  @Column({ name: 'vigencia_desde', type: 'date', nullable: true })
  vigenciaDesde?: string | null;

  @Column({ name: 'vigencia_hasta', type: 'date', nullable: true })
  vigenciaHasta?: string | null;

  @OneToMany(() => FtPlantillaItem, (i) => i.plantilla)
  items?: FtPlantillaItem[];

  @OneToMany(() => FtReglaAviso, (r) => r.plantilla)
  reglas?: FtReglaAviso[];
}
