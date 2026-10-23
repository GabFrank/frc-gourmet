import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { Penalizacion } from '../penalizacion.entity';
import { Moneda } from '../../financiero/moneda.entity';
import { Usuario } from '../../personas/usuario.entity';
import { DrTipoFalta } from './dr-tipo-falta.entity';
import { DrFaltaEstado, DrFaltaResultado } from './dr-falta.enum';

/**
 * Falta registrada a un funcionario. NO genera descuento por sí sola: recién al
 * aprobarse crea la `Penalizacion` (vínculo único `penalizacion_id`, garantiza
 * aprobación idempotente).
 */
@Entity('dr_falta')
@Index('IDX_dr_falta_funcionario_tipo_fecha', ['funcionario', 'tipoFalta', 'fecha'])
@Index('IDX_dr_falta_estado', ['estado'])
@Index('IDX_dr_falta_lote', ['loteId'])
@Index('UQ_dr_falta_penalizacion', ['penalizacion'], { unique: true })
export class DrFalta extends BaseModel {
  @Column({ type: 'date' })
  fecha!: Date;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @ManyToOne(() => DrTipoFalta, { nullable: false })
  @JoinColumn({ name: 'tipo_falta_id' })
  tipoFalta!: DrTipoFalta;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'detectado_por_id' })
  detectadoPor?: Usuario | null;

  @Column({ type: 'text', nullable: true })
  motivo?: string | null;

  @Column({ type: 'text', nullable: true })
  observacion?: string | null;

  /** Minutos de tardanza (si la falta viene de asistencia). */
  @Column({ name: 'minutos_tardanza', type: 'integer', nullable: true })
  minutosTardanza?: number | null;

  /** N.º de ocurrencia dentro de la ventana de reinicio (1 = primera). */
  @Column({ name: 'n_ocurrencia', type: 'integer', default: 1 })
  nOcurrencia!: number;

  @Column({ type: 'text', enum: DrFaltaResultado, default: DrFaltaResultado.ADVERTENCIA })
  resultado!: DrFaltaResultado;

  @Column({ name: 'monto_calculado', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoCalculado!: number;

  @ManyToOne(() => Moneda, { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda | null;

  @Column({ type: 'text', enum: DrFaltaEstado, default: DrFaltaEstado.REGISTRADA })
  estado!: DrFaltaEstado;

  @Column({ name: 'apelacion_texto', type: 'text', nullable: true })
  apelacionTexto?: string | null;

  @Column({ name: 'apelacion_fecha', nullable: true })
  apelacionFecha?: Date;

  /** Hasta cuándo se puede apelar (fecha del registro + plazo del tipo). */
  @Column({ name: 'apelacion_vence', nullable: true })
  apelacionVence?: Date;

  @Column({ name: 'renuncia_apelacion', default: false })
  renunciaApelacion!: boolean;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'resuelto_por_id' })
  resueltoPor?: Usuario | null;

  @Column({ name: 'resuelto_en', nullable: true })
  resueltoEn?: Date;

  @Column({ name: 'resolucion_texto', type: 'text', nullable: true })
  resolucionTexto?: string | null;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string | null;

  @ManyToOne(() => Penalizacion, { nullable: true })
  @JoinColumn({ name: 'penalizacion_id' })
  penalizacion?: Penalizacion | null;

  /** Mes de la liquidación donde impactó ('YYYY-MM'); puede diferir del mes del hecho. */
  @Column({ name: 'mes_destino', type: 'varchar', length: 7, nullable: true })
  mesDestino?: string | null;

  /** Agrupa las faltas creadas juntas en modo TODOS_PRESENTES. */
  @Column({ name: 'lote_id', type: 'varchar', length: 36, nullable: true })
  loteId?: string | null;

  /** JSON con los ítems del checklist que fallaron. */
  @Column({ name: 'checklist_fallado', type: 'text', nullable: true })
  checklistFallado?: string | null;
}
