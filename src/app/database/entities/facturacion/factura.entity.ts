import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TimbradoDetalle } from './timbrado-detalle.entity';
import { FacturaPlantilla } from './factura-plantilla.entity';
import { Venta } from '../ventas/venta.entity';
import { Cliente } from '../personas/cliente.entity';
import { Moneda } from '../financiero/moneda.entity';

/** Modelo de facturacion con el que se emitio el documento. */
export enum TipoFacturacion {
  PRE_IMPRESO = 'PRE_IMPRESO',
  AUTO_IMPRESO = 'AUTO_IMPRESO',
  ELECTRONICA = 'ELECTRONICA',
}

export enum CondicionVenta {
  CONTADO = 'CONTADO',
  CREDITO = 'CREDITO',
}

export enum EstadoFactura {
  EMITIDA = 'EMITIDA',
  ANULADA = 'ANULADA',
}

/**
 * Factura legal emitida por el sistema. La numeracion se asigna desde el
 * `TimbradoDetalle` correspondiente. Soporta los tres modelos de facturacion
 * (pre-impreso, auto-impreso, electronica). Para electronica se completan
 * `cdc` y el estado/seguimiento SIFEN en una fase posterior.
 */
@Entity('facturas')
export class Factura extends BaseModel {
  @ManyToOne(() => TimbradoDetalle, { nullable: true })
  @JoinColumn({ name: 'timbrado_detalle_id' })
  timbradoDetalle?: TimbradoDetalle;

  @ManyToOne(() => Venta, { nullable: true })
  @JoinColumn({ name: 'venta_id' })
  venta?: Venta;

  @ManyToOne(() => Cliente, { nullable: true })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @ManyToOne(() => FacturaPlantilla, { nullable: true })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla?: FacturaPlantilla;

  @Column({ type: 'varchar', enum: TipoFacturacion, default: TipoFacturacion.PRE_IMPRESO, name: 'tipo_facturacion' })
  tipoFacturacion!: TipoFacturacion;

  /** Numero secuencial asignado dentro del rango del timbrado. */
  @Column({ type: 'int', nullable: true, name: 'numero_factura' })
  numeroFactura?: number;

  /** Numero formateado completo, ej. '001-001-0000123'. */
  @Column({ nullable: true, name: 'numero_completo' })
  numeroCompleto?: string;

  @Column({ name: 'fecha' })
  fecha!: Date;

  @Column({ type: 'varchar', enum: CondicionVenta, default: CondicionVenta.CONTADO, name: 'condicion_venta' })
  condicionVenta!: CondicionVenta;

  // Datos del receptor (denormalizados; cliente FK es opcional para anonimos)
  @Column({ nullable: true, name: 'nombre_cliente' })
  nombreCliente?: string;

  @Column({ nullable: true })
  ruc?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({ nullable: true })
  email?: string;

  @ManyToOne(() => Moneda, { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true, name: 'tipo_cambio' })
  tipoCambio?: number;

  // Subtotales por tasa de IVA (Paraguay: 0/exenta, 5%, 10%)
  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  gravada10!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  gravada5!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  exenta!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  iva10!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  iva5!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  descuento!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  total!: number;

  /** Codigo de Control (CDC) para facturacion electronica (SIFEN). */
  @Column({ nullable: true })
  cdc?: string;

  @Column({ type: 'varchar', enum: EstadoFactura, default: EstadoFactura.EMITIDA })
  estado!: EstadoFactura;

  @Column({ nullable: true, type: 'text', name: 'motivo_anulacion' })
  motivoAnulacion?: string;

  @Column({ nullable: true, name: 'fecha_anulacion' })
  fechaAnulacion?: Date;

  @OneToMany('FacturaItem', 'factura', { cascade: true })
  items!: any[];
}
