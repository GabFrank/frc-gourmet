import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Gasto pagado con el efectivo de la **caja de venta** (PdV), a diferencia de
 * `Gasto` que pertenece a Caja Mayor. Descuenta del cajón de la caja abierta y
 * se refleja en el resumen de cierre.
 */
@Entity('gastos_caja')
export class GastoCaja extends BaseModel {
  @ManyToOne('Caja', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_id' })
  caja!: any;

  @ManyToOne('GastoCategoria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'gasto_categoria_id' })
  gastoCategoria?: any;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @ManyToOne('Moneda', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: any;

  @ManyToOne('FormasPago', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: any;

  @Column({ name: 'fecha' })
  fecha!: Date;

  /** ACTIVO | ANULADO */
  @Column({ type: 'varchar', default: 'ACTIVO' })
  estado!: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;
}
