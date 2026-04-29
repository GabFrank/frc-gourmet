import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Proveedor } from '../compras/proveedor.entity';
import { Moneda } from './moneda.entity';
import { Funcionario } from '../rrhh/funcionario.entity';
import { CuentaPorPagarEstado, CuentaPorPagarTipo } from './cuentas-por-pagar-enums';

@Entity('cuentas_por_pagar')
export class CuentaPorPagar extends BaseModel {
  @Column({ type: 'varchar', length: 200 })
  descripcion!: string;

  @Column({
    type: 'varchar',
    enum: CuentaPorPagarTipo,
    default: CuentaPorPagarTipo.COMPRA
  })
  tipo!: CuentaPorPagarTipo;

  @ManyToOne(() => Proveedor, { nullable: true })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  @ManyToOne(() => Funcionario, { nullable: true })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario?: Funcionario;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_total' })
  montoTotal!: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0, name: 'monto_pagado' })
  montoPagado!: number;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'date', name: 'fecha_inicio' })
  fechaInicio!: Date;

  @Column({ type: 'int', name: 'cantidad_cuotas', default: 1 })
  cantidadCuotas!: number;

  @Column({
    type: 'varchar',
    enum: CuentaPorPagarEstado,
    default: CuentaPorPagarEstado.ACTIVO
  })
  estado!: CuentaPorPagarEstado;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @OneToMany('CuentaPorPagarCuota', 'cuentaPorPagar')
  cuotas?: any[];
}
