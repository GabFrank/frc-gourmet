import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { FormasPago } from '../compras/forma-pago.entity';
import { Caja } from '../financiero/caja.entity';
import { Pago } from '../compras/pago.entity';
import { Delivery } from './delivery.entity';
import { Usuario } from '../personas/usuario.entity';
import type { PdvMesa } from './pdv-mesa.entity';

/**
 * Enum for sale states
 */
export enum VentaEstado {
  ABIERTA = 'ABIERTA',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA'
}

/**
 * Entity representing a sale
 */
@Entity('ventas')
export class Venta extends BaseModel {
  @ManyToOne(() => Cliente)
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({
    type: 'varchar',
    enum: VentaEstado,
    default: VentaEstado.ABIERTA
  })
  estado!: VentaEstado;

  @Column({ type: 'varchar', nullable: true })
  nombreCliente?: string;

  @ManyToOne(() => FormasPago)
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: FormasPago;

  @ManyToOne(() => Caja)
  @JoinColumn({ name: 'caja_id' })
  caja!: Caja;

  // F5: device tracking — el dispositivo desde donde se origino esta venta.
  // Nullable porque ventas pre-F5 no tienen este dato. En cliente HTTP el
  // server lo resuelve del JWT claim. En IPC standalone/server hoy lo dejan
  // null hasta que la UI tenga registrado el dispositivo activo.
  @ManyToOne('Dispositivo', { nullable: true })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo?: any;

  @ManyToOne(() => Pago, { nullable: true })
  @JoinColumn({ name: 'pago_id' })
  pago?: Pago;

  @ManyToOne(() => Delivery, { nullable: true })
  @JoinColumn({ name: 'delivery_id' })
  delivery?: Delivery;

  @ManyToOne('PdvMesa', { nullable: true })
  @JoinColumn({ name: 'mesa_id' })
  mesa?: PdvMesa;

  @OneToMany('VentaItem', 'venta')
  items!: any[];

  // Descuento global
  @Column({ name: 'descuento_porcentaje', type: 'decimal', precision: 10, scale: 2, nullable: true })
  descuentoPorcentaje?: number;

  @Column({ name: 'descuento_monto', type: 'decimal', precision: 10, scale: 2, nullable: true })
  descuentoMonto?: number;

  @Column({ name: 'descuento_motivo', type: 'varchar', nullable: true })
  descuentoMotivo?: string;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'descuento_autorizado_por_id' })
  descuentoAutorizadoPor?: Usuario;

  @Column({ name: 'fecha_cierre', nullable: true })
  fechaCierre?: Date;

  // Comanda (tarjeta de cuenta individual)
  @ManyToOne('Comanda', { nullable: true })
  @JoinColumn({ name: 'comanda_id' })
  comanda?: any;

  // División de cuenta
  @ManyToOne('Venta', { nullable: true })
  @JoinColumn({ name: 'venta_padre_id' })
  ventaPadre?: any;

  // Vendedor explícito (para comisiones; por defecto = createdBy)
  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'vendedor_id' })
  vendedor?: Usuario;

  @Column({ name: 'total', type: 'decimal', precision: 18, scale: 2, nullable: true })
  total?: number;
} 