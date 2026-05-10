import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { CompraEstado } from './estado.enum';
import { TipoBoleta } from './tipo-boleta.enum';
import { FormaPagoCompra } from './forma-pago-compra.enum';
import { FormasPago } from './forma-pago.entity';
import { CuentaBancaria } from '../financiero/cuenta-bancaria.entity';
import type { CompraDetalle } from './compra-detalle.entity';
import type { Pago } from './pago.entity';
import type { Proveedor } from './proveedor.entity';

@Entity('compras')
export class Compra extends BaseModel {
  @Column({
    type: 'text',
    enum: CompraEstado,
    default: CompraEstado.ABIERTO
  })
  estado!: CompraEstado;

  @Column({ default: false, name: 'is_recepcion_mercaderia' })
  isRecepcionMercaderia!: boolean;

  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true, name: 'numero_nota', type: 'varchar', length: 100 })
  numeroNota?: string;

  @Column({
    nullable: true,
    type: 'text',
    enum: TipoBoleta,
    name: 'tipo_boleta'
  })
  tipoBoleta?: TipoBoleta;

  @Column({ nullable: true, name: 'fecha_compra', type: 'date' })
  fechaCompra?: Date;

  @Column({ default: false })
  credito!: boolean;

  @Column({ nullable: true, name: 'plazo_dias', type: 'int' })
  plazoDias?: number;

  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  total!: number;

  @Column({ nullable: true, name: 'motivo_anulacion', type: 'text' })
  motivoAnulacion?: string;

  @ManyToOne('Proveedor', 'compras', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor?: Proveedor;

  // @deprecated — uso legacy. Compras nuevas se pagan via CajaMayor (contado) o CuentaPorPagar (credito).
  @ManyToOne('Pago', 'compras', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'pago_id' })
  pago?: Pago;

  @ManyToOne(() => Moneda)
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  // @deprecated — sustituido por `formaPagoCompra` (enum acotado).
  @ManyToOne(() => FormasPago, { nullable: true })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: FormasPago;

  @Column({
    type: 'text',
    enum: FormaPagoCompra,
    default: FormaPagoCompra.EFECTIVO,
    name: 'forma_pago_compra',
  })
  formaPagoCompra!: FormaPagoCompra;

  // Cuenta bancaria opcional al cargar la compra (puede decidirse al pagar).
  @ManyToOne(() => CuentaBancaria, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_id' })
  cuentaBancaria?: CuentaBancaria;

  @OneToMany('CompraDetalle', 'compra')
  detalles!: CompraDetalle[];

  @ManyToOne('CompraCategoria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'compra_categoria_id' })
  compraCategoria?: any;

  @ManyToOne('CuentaPorPagar', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_por_pagar_id' })
  cuentaPorPagar?: any;

  // F5: device tracking — dispositivo donde se registró la compra.
  @ManyToOne('Dispositivo', { nullable: true })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo?: any;
}
