import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Moneda } from '../financiero/moneda.entity';
import { Usuario } from '../personas/usuario.entity';
import { MotivoEgreso } from './motivo-egreso.enum';

export enum LiquidacionFinalEstado {
  BORRADOR = 'BORRADOR',
  APROBADA = 'APROBADA',
  PAGADA = 'PAGADA',
  ANULADA = 'ANULADA',
}

@Entity('liquidaciones_final')
export class LiquidacionFinal extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({ name: 'fecha_egreso', type: 'date' })
  fechaEgreso!: Date;

  @Column({
    name: 'motivo_egreso',
    type: 'text',
    enum: MotivoEgreso,
  })
  motivoEgreso!: MotivoEgreso;

  @Column({ name: 'antiguedad_dias', type: 'int', default: 0 })
  antiguedadDias!: number;

  @Column({ name: 'antiguedad_meses', type: 'int', default: 0 })
  antiguedadMeses!: number;

  @Column({ name: 'antiguedad_anios', type: 'int', default: 0 })
  antiguedadAnios!: number;

  @Column({
    name: 'salario_promedio_ultimos_6_meses',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  salarioPromedioUltimos6Meses!: number;

  @Column({
    name: 'indemnizacion_monto',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  indemnizacionMonto!: number;

  @Column({ name: 'indemnizacion_aplica', default: false })
  indemnizacionAplica!: boolean;

  @Column({ name: 'vacaciones_no_gozadas', type: 'int', default: 0 })
  vacacionesNoGozadas!: number;

  @Column({
    name: 'monto_vacaciones_no_gozadas',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  montoVacacionesNoGozadas!: number;

  @Column({
    name: 'aguinaldo_proporcional',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  aguinaldoProporcional!: number;

  @Column({
    name: 'total_liquidado',
    type: 'decimal',
    precision: 18,
    scale: 2,
    default: 0,
  })
  totalLiquidado!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({
    type: 'text',
    enum: LiquidacionFinalEstado,
    default: LiquidacionFinalEstado.BORRADOR,
  })
  estado!: LiquidacionFinalEstado;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'aprobado_por_id' })
  aprobadoPor?: Usuario;

  @Column({ name: 'fecha_aprobacion', nullable: true })
  fechaAprobacion?: Date;

  @Column({ name: 'fecha_pago', nullable: true })
  fechaPago?: Date;

  @Column({ name: 'movimiento_id', type: 'int', nullable: true })
  movimientoId?: number;

  @Column({ nullable: true })
  observacion?: string;

  @OneToMany('LiquidacionFinalItem', 'liquidacionFinal')
  items?: any[];
}
