import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Moneda } from '../../financiero/moneda.entity';
import { DrGrupo } from './dr-grupo.entity';
import { DrModoAplicacion, DrReinicio } from './dr-tipo-falta.enum';

@Entity('dr_tipo_falta')
export class DrTipoFalta extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @ManyToOne(() => DrGrupo, { nullable: true })
  @JoinColumn({ name: 'grupo_id' })
  grupo?: DrGrupo | null;

  @Column({ name: 'modo_aplicacion', type: 'text', enum: DrModoAplicacion, default: DrModoAplicacion.INDIVIDUAL })
  modoAplicacion!: DrModoAplicacion;

  /** Cantidad de ocurrencias que son solo advertencia antes de multar. */
  @Column({ name: 'advertencias_previas', type: 'integer', default: 0 })
  advertenciasPrevias!: number;

  @Column({ name: 'monto_multa', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoMulta!: number;

  /** Moneda de referencia del monto (la multa real usa la moneda del sueldo; si no coincide se rechaza). */
  @ManyToOne(() => Moneda, { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda | null;

  /** JSON opcional: { "<n.º de ocurrencia>": monto }. */
  @Column({ name: 'escala_montos', type: 'text', nullable: true })
  escalaMontos?: string | null;

  @Column({ type: 'text', enum: DrReinicio, default: DrReinicio.MENSUAL })
  reinicio!: DrReinicio;

  @Column({ name: 'tolerancia_minutos', type: 'integer', nullable: true })
  toleranciaMinutos?: number | null;

  /** Si true, la falta se alimenta de la asistencia (tardanza). */
  @Column({ name: 'fuente_asistencia', default: false })
  fuenteAsistencia!: boolean;

  @Column({ name: 'plazo_apelacion_horas', type: 'integer', default: 48 })
  plazoApelacionHoras!: number;

  @Column({ name: 'requiere_checklist', default: false })
  requiereChecklist!: boolean;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('DrChecklistItem', 'tipoFalta')
  checklist?: any[];
}
