import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { Moneda } from './moneda.entity';
import { CuentaPorCobrarEstado, CuentaPorCobrarTipo } from './cuentas-por-cobrar-enums';

@Entity('cuentas_por_cobrar')
export class CuentaPorCobrar extends BaseModel {
  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({
    type: 'varchar',
    enum: CuentaPorCobrarTipo,
    default: CuentaPorCobrarTipo.OTRO
  })
  tipo!: CuentaPorCobrarTipo;

  @Column({ type: 'varchar', length: 200, nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_total' })
  montoTotal!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0, name: 'monto_cobrado' })
  montoCobrado!: number;

  @Column({ type: 'int', name: 'cantidad_cuotas', default: 1 })
  cantidadCuotas!: number;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio!: Date;

  @ManyToOne(() => Moneda, { nullable: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({
    type: 'varchar',
    enum: CuentaPorCobrarEstado,
    default: CuentaPorCobrarEstado.ACTIVO
  })
  estado!: CuentaPorCobrarEstado;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ name: 'venta_id', type: 'int', nullable: true })
  ventaId?: number;

  @Column({ type: 'date', name: 'fecha_cancelacion', nullable: true })
  fechaCancelacion?: Date;

  @Column({ type: 'varchar', length: 300, name: 'motivo_cancelacion', nullable: true })
  motivoCancelacion?: string;

  @OneToMany('CuentaPorCobrarCuota', 'cuentaPorCobrar')
  cuotas?: any[];
}
