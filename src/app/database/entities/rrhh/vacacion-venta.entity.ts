import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Vacacion } from './vacacion.entity';

export enum VacacionVentaEstado {
  PENDIENTE = 'PENDIENTE', // creada, aún no pagada en una liquidación
  PAGADO = 'PAGADO',       // integrada/pagada en una liquidación de sueldo
  ANULADO = 'ANULADO',
}

/**
 * Venta de días de vacaciones: el funcionario "vende" días no gozados y se le
 * paga su equivalente (días × salario diario). Se cobra como HABER en la
 * liquidación de sueldo. Al pagar la liquidación pasa a PAGADO; al anularla
 * vuelve a PENDIENTE.
 */
@Entity('vacacion_ventas')
export class VacacionVenta extends BaseModel {
  @ManyToOne(() => Vacacion, { nullable: false })
  @JoinColumn({ name: 'vacacion_id' })
  vacacion!: Vacacion;

  @Column({ type: 'int', name: 'dias' })
  dias!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto', default: 0 })
  monto!: number;

  @Column({ name: 'fecha' })
  fecha!: Date;

  @Column({ type: 'varchar', length: 20, enum: VacacionVentaEstado, default: VacacionVentaEstado.PENDIENTE })
  estado!: VacacionVentaEstado;

  @Column({ name: 'liquidacion_id', type: 'int', nullable: true })
  liquidacionId?: number;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
