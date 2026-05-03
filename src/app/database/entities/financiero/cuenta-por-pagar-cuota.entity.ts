import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuotaEstado } from './cuentas-por-pagar-enums';

@Entity('cuentas_por_pagar_cuotas')
export class CuentaPorPagarCuota extends BaseModel {
  @ManyToOne('CuentaPorPagar', 'cuotas', { nullable: false, onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_por_pagar_id' })
  cuentaPorPagar!: any;

  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'date', name: 'fecha_vencimiento' })
  fechaVencimiento!: Date;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, name: 'monto_pagado' })
  montoPagado!: number;

  @Column({
    type: 'varchar',
    enum: CuotaEstado,
    default: CuotaEstado.PENDIENTE
  })
  estado!: CuotaEstado;

  @Column({ type: 'datetime', name: 'fecha_pago', nullable: true })
  fechaPago?: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;
}
