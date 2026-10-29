import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuentaBancaria } from './cuenta-bancaria.entity';
import { ConciliacionPosEstado } from './banking-enums';

/**
 * Un crédito real del banco conciliado contra N acreditaciones POS pendientes (issue #320).
 * Deshacer la conciliación revierte su movimiento bancario y devuelve las acreditaciones a PENDIENTE.
 */
@Entity('conciliaciones_pos')
export class ConciliacionPos extends BaseModel {
  @ManyToOne(() => CuentaBancaria)
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria!: CuentaBancaria;

  @Column({ type: 'date', name: 'fecha_credito' })
  fechaCredito!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_credito' })
  montoCredito!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_esperado' })
  montoEsperado!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  diferencia!: number;

  @Column({ type: 'varchar', length: 100, nullable: true })
  referencia?: string;

  @Column({ type: 'int', nullable: true, name: 'cantidad_acreditaciones' })
  cantidadAcreditaciones?: number;

  @Column({ type: 'varchar', length: 20, default: ConciliacionPosEstado.ACTIVA })
  estado!: ConciliacionPosEstado;

  @Column({ nullable: true, name: 'fecha_deshecha' })
  fechaDeshecha?: Date;
}
