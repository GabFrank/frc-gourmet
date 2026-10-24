import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { Funcionario } from '../funcionario.entity';
import { Bono } from '../bono.entity';
import { Moneda } from '../../financiero/moneda.entity';
import { Usuario } from '../../personas/usuario.entity';
import { DrPeriodo } from './dr-periodo.entity';
import { DrResultadoEstado } from './dr-resultado-estado.enum';

/** Resultado de un funcionario en un período de premio. Al aprobarse crea el `Bono` (vínculo único). */
@Entity('dr_resultado_premio')
@Index('UQ_dr_resultado_premio_periodo_func', ['periodo', 'funcionario'], { unique: true })
@Index('UQ_dr_resultado_premio_bono', ['bono'], { unique: true })
export class DrResultadoPremio extends BaseModel {
  @ManyToOne(() => DrPeriodo, { nullable: false })
  @JoinColumn({ name: 'periodo_id' })
  periodo!: DrPeriodo;

  @ManyToOne(() => Funcionario, { nullable: false })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  puntaje!: number;

  @Column({ type: 'integer', nullable: true })
  posicion?: number | null;

  @Column({ default: false })
  ganador!: boolean;

  @Column({ name: 'monto_propuesto', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoPropuesto!: number;

  @Column({ name: 'monto_aprobado', type: 'decimal', precision: 18, scale: 2, nullable: true })
  montoAprobado?: number | null;

  @ManyToOne(() => Moneda, { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda | null;

  @Column({ type: 'text', enum: DrResultadoEstado, default: DrResultadoEstado.PROPUESTO })
  estado!: DrResultadoEstado;

  @ManyToOne(() => Bono, { nullable: true })
  @JoinColumn({ name: 'bono_id' })
  bono?: Bono | null;

  /** Mes de la liquidación donde impactó ('YYYY-MM'). */
  @Column({ name: 'mes_destino', type: 'varchar', length: 7, nullable: true })
  mesDestino?: string | null;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobado_por_id' })
  aprobadoPor?: Usuario | null;

  @Column({ name: 'aprobado_en', nullable: true })
  aprobadoEn?: Date;

  @Column({ type: 'text', nullable: true })
  observacion?: string | null;
}
