import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoOperacionFinanciera, DiferenciaDestinoTipo } from './operaciones-financieras-enums';

@Entity('operaciones_financieras')
export class OperacionFinanciera extends BaseModel {
  @Column({
    type: 'varchar',
    name: 'tipo_operacion',
    enum: TipoOperacionFinanciera,
  })
  tipoOperacion!: TipoOperacionFinanciera;

  @ManyToOne('OperacionFinancieraCategoria', { nullable: true })
  @JoinColumn({ name: 'operacion_financiera_categoria_id' })
  operacionFinancieraCategoria?: any;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ type: 'datetime' })
  fecha!: Date;

  // ===================== ORIGEN =====================
  @ManyToOne('CajaMayor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_origen_id' })
  cajaMayorOrigen?: any;

  @ManyToOne('Moneda', { nullable: true })
  @JoinColumn({ name: 'moneda_origen_id' })
  monedaOrigen?: any;

  @ManyToOne('FormasPago', { nullable: true })
  @JoinColumn({ name: 'forma_pago_origen_id' })
  formaPagoOrigen?: any;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_origen', nullable: true })
  montoOrigen?: number;

  @ManyToOne('CuentaBancaria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_origen_id' })
  cuentaBancariaOrigen?: any;

  // ===================== DESTINO =====================
  @ManyToOne('CajaMayor', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_mayor_destino_id' })
  cajaMayorDestino?: any;

  @ManyToOne('Moneda', { nullable: true })
  @JoinColumn({ name: 'moneda_destino_id' })
  monedaDestino?: any;

  @ManyToOne('FormasPago', { nullable: true })
  @JoinColumn({ name: 'forma_pago_destino_id' })
  formaPagoDestino?: any;

  @Column({ type: 'decimal', precision: 14, scale: 2, name: 'monto_destino', nullable: true })
  montoDestino?: number;

  @ManyToOne('CuentaBancaria', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_bancaria_destino_id' })
  cuentaBancariaDestino?: any;

  // ===================== ESPECIFICO POR TIPO =====================

  // CAMBIO_DIVISA: cotizacion (montoDestino = montoOrigen * cotizacion)
  @Column({ type: 'decimal', precision: 14, scale: 6, nullable: true })
  cotizacion?: number;

  // DEPOSITO_BANCARIO / RETIRO_BANCARIO
  @Column({ name: 'numero_comprobante', type: 'varchar', length: 100, nullable: true })
  numeroComprobante?: string;

  @Column({ name: 'comprobante_url', type: 'varchar', length: 500, nullable: true })
  comprobanteUrl?: string;

  // ===================== DIFERENCIA =====================
  // Cuando origen y destino no cuadran exactamente, se imputa como gasto o vale.
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  diferencia!: number;

  @Column({
    type: 'varchar',
    name: 'diferencia_destino_tipo',
    enum: DiferenciaDestinoTipo,
    nullable: true,
  })
  diferenciaDestinoTipo?: DiferenciaDestinoTipo;

  @Column({ type: 'text', name: 'diferencia_observacion', nullable: true })
  diferenciaObservacion?: string;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ default: false })
  anulado!: boolean;
}
