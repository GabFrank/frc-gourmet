import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuentaPorCobrarCuotaEstado } from './cuentas-por-cobrar-enums';

@Entity('cuentas_por_cobrar_cuotas')
export class CuentaPorCobrarCuota extends BaseModel {
  @ManyToOne('CuentaPorCobrar', 'cuotas', { nullable: false, onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_por_cobrar_id' })
  cuentaPorCobrar!: any;

  @Column({ type: 'int' })
  numero!: number;

  @Column({ type: 'date', name: 'fecha_vencimiento' })
  fechaVencimiento!: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, name: 'monto_cobrado' })
  montoCobrado!: number;

  @Column({
    type: 'varchar',
    enum: CuentaPorCobrarCuotaEstado,
    default: CuentaPorCobrarCuotaEstado.PENDIENTE
  })
  estado!: CuentaPorCobrarCuotaEstado;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'fecha_cobro', nullable: true })
  fechaCobro?: Date;
}
