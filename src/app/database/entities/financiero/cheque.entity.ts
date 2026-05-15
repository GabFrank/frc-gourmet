import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ChequeEstado } from './cheques-enums';

@Entity('cheques')
export class Cheque extends BaseModel {
  @ManyToOne('Chequera', 'cheques', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'chequera_id' })
  chequera!: any;

  @ManyToOne('CuentaBancaria', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria!: any;

  @Column({ name: 'numero_cheque', type: 'varchar', length: 30 })
  numeroCheque!: string;

  @Column({ type: 'decimal', precision: 14, scale: 2 })
  monto!: number;

  @ManyToOne('Moneda', { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: any;

  @Column({ type: 'varchar', length: 200, nullable: true })
  beneficiario?: string;

  @ManyToOne('Proveedor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: any;

  @Column({ name: 'fecha_emision' })
  fechaEmision!: Date;

  @Column({ name: 'fecha_pago', nullable: true })
  fechaPago?: Date;

  @Column({ name: 'fecha_cobro', nullable: true })
  fechaCobro?: Date;

  @Column({
    type: 'varchar',
    enum: ChequeEstado,
    default: ChequeEstado.EMITIDO,
  })
  estado!: ChequeEstado;

  @Column({ name: 'es_diferido', default: false })
  esDiferido!: boolean;

  // Caja mayor desde la cual se emite (para EGRESO_CHEQUE)
  @ManyToOne('CajaMayor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor?: any;

  @ManyToOne('FormasPago', { nullable: true })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: any;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;
}
