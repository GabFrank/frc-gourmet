import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuotaEstado } from '../financiero/cuentas-por-pagar-enums';

// @deprecated — Las cuotas de compra a credito ahora se manejan via CuentaPorPagar+CuentaPorPagarCuota.
// Esta entidad se mantiene solo para preservar datos legacy.
@Entity('compras_cuotas')
export class CompraCuota extends BaseModel {
  @ManyToOne('Compra', 'cuotas', { nullable: false, onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'compra_id' })
  compra!: any;

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

  @Column({ name: 'fecha_pago', nullable: true })
  fechaPago?: Date;
}
