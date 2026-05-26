import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { GastoDestinoTipo, GastoEstado, GastoFrecuencia } from './caja-mayor-enums';
import { TipoBoleta } from '../compras/tipo-boleta.enum';

@Entity('gastos')
export class Gasto extends BaseModel {
  @ManyToOne('GastoCategoria', { nullable: false })
  @JoinColumn({ name: 'gasto_categoria_id' })
  gastoCategoria!: any;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  monto!: number;

  @ManyToOne('Moneda', { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: any;

  @ManyToOne('FormasPago', { nullable: true })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: any;

  @OneToMany('GastoDetalle', 'gasto', { cascade: true })
  detalles?: any[];

  @Column()
  fecha!: Date;

  @ManyToOne('CajaMayor', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_id' })
  cajaMayor!: any;

  @Column({ name: 'es_recurrente', default: false })
  esRecurrente!: boolean;

  @Column({ name: 'es_fijo', default: false })
  esFijo!: boolean;

  @Column({
    type: 'varchar',
    enum: GastoFrecuencia,
    nullable: true
  })
  frecuencia?: GastoFrecuencia;

  @Column({ name: 'proximo_vencimiento', type: 'date', nullable: true })
  proximoVencimiento?: Date;

  @ManyToOne('Proveedor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: any;

  @Column({ name: 'numero_comprobante', type: 'varchar', length: 100, nullable: true })
  numeroComprobante?: string;

  @Column({
    name: 'tipo_boleta',
    type: 'varchar',
    enum: TipoBoleta,
    nullable: true
  })
  tipoBoleta?: TipoBoleta;

  @Column({
    type: 'varchar',
    enum: GastoEstado,
    default: GastoEstado.PENDIENTE
  })
  estado!: GastoEstado;

  /**
   * Hacia dónde sale el dinero del gasto. Default CAJA_MAYOR mantiene el
   * comportamiento histórico (movimiento en caja mayor). CUENTA_BANCARIA
   * debita directo `cuenta_bancaria.saldo` y NO genera movimiento de caja.
   */
  @Column({
    name: 'destino_tipo',
    type: 'varchar',
    enum: GastoDestinoTipo,
    default: GastoDestinoTipo.CAJA_MAYOR,
  })
  destinoTipo!: GastoDestinoTipo;

  @ManyToOne('CuentaBancaria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria?: any;
}
