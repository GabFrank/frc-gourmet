import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { MaquinaPos } from './maquina-pos.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';
import { Usuario } from '../personas/usuario.entity';
import { AcreditacionPosEstado } from './banking-enums';

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

  // Nullable FK to Venta — sin constraint para no requerir orden de carga
  @Column({ type: 'int', nullable: true, name: 'venta_id' })
  ventaId?: number;
}
