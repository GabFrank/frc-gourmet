import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { MaquinaPos } from './maquina-pos.entity';
import { MedioPos, TipoDiasAcreditacion, BasePlazoAcreditacion, ModoAcreditacionPos } from './banking-enums';

/**
 * Regla de acreditación de una máquina POS para un medio (QR, débito, crédito). Issue #320.
 * Sin regla activa para el medio, la acreditación usa el % y los minutos de la máquina (comportamiento anterior).
 */
@Entity('maquinas_pos_reglas')
@Index('UQ_maquinas_pos_reglas_maquina_medio', ['maquinaPos', 'medio'], { unique: true })
export class MaquinaPosRegla extends BaseModel {
  @ManyToOne(() => MaquinaPos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'maquina_pos_id' })
  maquinaPos!: MaquinaPos;

  @Column({ type: 'varchar', length: 20 })
  medio!: MedioPos;

  @Column({ type: 'int', name: 'plazo_dias', default: 0 })
  plazoDias!: number;

  @Column({ type: 'varchar', length: 20, name: 'tipo_dias', default: TipoDiasAcreditacion.HABILES })
  tipoDias!: TipoDiasAcreditacion;

  @Column({ type: 'varchar', length: 20, name: 'base_plazo', default: BasePlazoAcreditacion.PROCESO })
  base!: BasePlazoAcreditacion;

  @Column({ name: 'correr_a_habil', default: true })
  correrAHabil!: boolean;

  @Column({ type: 'decimal', precision: 7, scale: 3, name: 'porcentaje_comision', default: 0 })
  porcentajeComision!: number;

  @Column({ type: 'int', name: 'redondeo_comision', default: 0 })
  redondeoComision!: number;

  @Column({ type: 'decimal', precision: 7, scale: 3, name: 'porcentaje_iva_comision', default: 0 })
  porcentajeIvaComision!: number;

  @Column({ type: 'decimal', precision: 7, scale: 3, name: 'porcentaje_ret_renta', default: 0 })
  porcentajeRetRenta!: number;

  @Column({ type: 'decimal', precision: 7, scale: 3, name: 'porcentaje_ret_iva', default: 0 })
  porcentajeRetIva!: number;

  @Column({ type: 'decimal', precision: 7, scale: 3, name: 'divisor_iva_venta', default: 11 })
  divisorIvaVenta!: number;

  @Column({ type: 'varchar', length: 30, default: ModoAcreditacionPos.NETO })
  modo!: ModoAcreditacionPos;

  /** false = valores sin extracto real que los confirme. */
  @Column({ default: false })
  verificada!: boolean;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ default: true })
  activo!: boolean;
}
