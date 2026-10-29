import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { MaquinaPos } from './maquina-pos.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';
import { Usuario } from '../personas/usuario.entity';
import { AcreditacionPosEstado, MedioPos } from './banking-enums';

@Entity('acreditaciones_pos')
export class AcreditacionPos extends BaseModel {
  @ManyToOne(() => MaquinaPos)
  @JoinColumn({ name: 'maquina_pos_id' })
  maquinaPos!: MaquinaPos;

  @ManyToOne(() => CuentaBancaria)
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria!: CuentaBancaria;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_original' })
  montoOriginal!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_comision', default: 0 })
  montoComision!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_esperado' })
  montoEsperado!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_acreditado', nullable: true })
  montoAcreditado?: number;

  @Column({ name: 'fecha_transaccion' })
  fechaTransaccion!: Date;

  @Column({ name: 'fecha_esperada_acreditacion' })
  fechaEsperadaAcreditacion!: Date;

  @Column({ name: 'fecha_acreditacion_real', nullable: true })
  fechaAcreditacionReal?: Date;

  @Column({
    type: 'varchar',
    enum: AcreditacionPosEstado,
    default: AcreditacionPosEstado.PENDIENTE
  })
  estado!: AcreditacionPosEstado;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  diferencia?: number;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'verificado_por' })
  verificadoPor?: Usuario;

  @Column({ nullable: true, name: 'fecha_verificacion' })
  fechaVerificacion?: Date;

  // ── Desglose por regla (issue #320). Nulos en las acreditaciones creadas sin regla. ──
  @Column({ type: 'varchar', length: 20, nullable: true })
  medio?: MedioPos;

  @Column({ type: 'varchar', length: 30, nullable: true })
  marca?: string;

  @Column({ type: 'int', nullable: true })
  cuotas?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_iva_comision', nullable: true })
  montoIvaComision?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_ret_renta', nullable: true })
  montoRetRenta?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_ret_iva', nullable: true })
  montoRetIva?: number;

  /** Regla usada para calcular (sin FK: la regla puede editarse o borrarse después). */
  @Column({ type: 'int', nullable: true, name: 'regla_id' })
  reglaId?: number;

  @Column({ type: 'int', nullable: true, name: 'conciliacion_id' })
  conciliacionId?: number;

  // Nullable FK to Venta — sin constraint para no requerir orden de carga
  @Column({ type: 'int', nullable: true, name: 'venta_id' })
  ventaId?: number;
}
