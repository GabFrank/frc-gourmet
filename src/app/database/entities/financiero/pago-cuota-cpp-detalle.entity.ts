import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Detalle (linea) de un pago mixto de una cuota de CuentaPorPagar (compra).
 *
 * Cada linea representa una porcion del pago con su propia moneda + forma de
 * pago. `montoOrigen` esta en la moneda de la linea; `montoCpp` es esa porcion
 * convertida a la moneda de la deuda (CPP) usando `cotizacion` — la SUMA de los
 * `montoCpp` de todas las lineas es lo que reduce `cuota.montoPagado`.
 *
 * Aditivo: NO altera `cuentas_por_pagar` ni `cuentas_por_pagar_cuotas`. Guarda
 * la cotizacion y el monto convertido usados en el momento del pago para que una
 * eventual anulacion sea deterministica (reversal-ready).
 */
@Entity('pago_cuota_cpp_detalles')
export class PagoCuotaCppDetalle extends BaseModel {
  @ManyToOne('CuentaPorPagarCuota', { nullable: false, onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_por_pagar_cuota_id' })
  cuota!: any;

  @Column({ name: 'cuenta_por_pagar_cuota_id', type: 'int' })
  cuentaPorPagarCuotaId!: number;

  @ManyToOne('Moneda', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: any;

  // Forma de pago: null cuando la fuente es cuenta bancaria (el banco no usa forma).
  @ManyToOne('FormasPago', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: any;

  // CAJA_MAYOR | CUENTA_BANCARIA
  @Column({ name: 'fuente', type: 'varchar', length: 20, default: 'CAJA_MAYOR' })
  fuente!: string;

  // Monto en la moneda de la linea (moneda_id).
  @Column({ name: 'monto_origen', type: 'decimal', precision: 18, scale: 2 })
  montoOrigen!: number;

  // Tasa moneda_linea -> moneda_cpp (1 si son la misma).
  @Column({ name: 'cotizacion', type: 'decimal', precision: 18, scale: 6, default: 1 })
  cotizacion!: number;

  // montoOrigen * cotizacion, en la moneda del CPP. Suma de estos = pago a la cuota.
  @Column({ name: 'monto_cpp', type: 'decimal', precision: 18, scale: 2 })
  montoCpp!: number;

  // Movimiento de Caja Mayor generado por esta linea (si fuente = CAJA_MAYOR).
  @Column({ name: 'caja_mayor_movimiento_id', type: 'int', nullable: true })
  cajaMayorMovimientoId?: number;

  // Cuenta bancaria debitada (si fuente = CUENTA_BANCARIA).
  @Column({ name: 'cuenta_bancaria_id', type: 'int', nullable: true })
  cuentaBancariaId?: number;

  // Egreso del cajon del PdV generado por esta linea (si fuente = PDV_CAJA).
  @Column({ name: 'egreso_caja_id', type: 'int', nullable: true })
  egresoCajaId?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  observacion?: string;
}
