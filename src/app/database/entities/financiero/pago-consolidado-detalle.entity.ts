import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';
import { FormasPago } from '../compras/forma-pago.entity';
import { PagoConsolidado } from './pago-consolidado.entity';
import { PagoConsolidadoFuente, PagoOrigenTipo } from './pago-consolidado-enums';

/**
 * Una fila por (obligacion x linea de pago) — producto cartesiano. Es lo que
 * permite responder las dos preguntas de un pago consolidado:
 *
 *  - "cuanto recibio cada obligacion"  -> SUM(montoImputado) GROUP BY origenId
 *  - "de donde salio cada guarani"     -> SUM(montoOrigen)  GROUP BY linea fisica
 *
 * Una linea de pago se PARTE entre varias obligaciones (reparto FIFO): la suma de
 * `montoOrigen` de las filas de una misma linea fisica es el monto de esa linea.
 *
 * Se guardan `cotizacion` y `montoImputado` del momento del pago para que la
 * anulacion sea deterministica: no se recalcula nada con cotizaciones de hoy.
 */
@Entity('pagos_consolidados_detalles')
export class PagoConsolidadoDetalle extends BaseModel {
  @ManyToOne(() => PagoConsolidado, { nullable: false, onDelete: 'CASCADE', createForeignKeyConstraints: false })
  @JoinColumn({ name: 'pago_consolidado_id' })
  pagoConsolidado!: PagoConsolidado;

  @Column({ type: 'int', name: 'pago_consolidado_id' })
  pagoConsolidadoId!: number;

  // ─────────────── obligacion pagada ───────────────

  @Column({ type: 'varchar', length: 30, name: 'origen_tipo', enum: PagoOrigenTipo })
  origenTipo!: PagoOrigenTipo;

  @Column({ type: 'int', name: 'origen_id' })
  origenId!: number;

  /**
   * Snapshot legible al momento del pago ("GASTO #12 (ALQUILER)"). Se guarda en vez
   * de recomponerse al leer porque la obligacion vive en 4 tablas distintas y su
   * texto puede cambiar despues del pago.
   */
  @Column({ type: 'varchar', length: 255, name: 'origen_descripcion' })
  origenDescripcion!: string;

  @Column({ type: 'varchar', length: 255, name: 'origen_beneficiario', nullable: true })
  origenBeneficiario?: string;

  // ─────────────── linea de pago ───────────────

  @Column({ type: 'varchar', length: 20, enum: PagoConsolidadoFuente, default: PagoConsolidadoFuente.CAJA_MAYOR })
  fuente!: PagoConsolidadoFuente;

  /** Moneda de la linea. Puede diferir de la moneda de la deuda. */
  @ManyToOne(() => Moneda, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @Column({ type: 'int', name: 'moneda_id' })
  monedaId!: number;

  /** Null cuando la fuente es cuenta bancaria (el banco no usa forma de pago). */
  @ManyToOne(() => FormasPago, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: FormasPago;

  @Column({ type: 'int', name: 'forma_pago_id', nullable: true })
  formaPagoId?: number;

  @Column({ type: 'int', name: 'caja_mayor_id', nullable: true })
  cajaMayorId?: number;

  @Column({ type: 'int', name: 'cuenta_bancaria_id', nullable: true })
  cuentaBancariaId?: number;

  /** Porcion de esta linea imputada a esta obligacion, en la moneda de la linea. */
  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_origen' })
  montoOrigen!: number;

  /** Tasa moneda de la linea -> moneda de la deuda (1 si son la misma). */
  @Column({ type: 'decimal', precision: 18, scale: 6, default: 1 })
  cotizacion!: number;

  /** `montoOrigen * cotizacion`, en la moneda de la deuda. Es lo que reduce la deuda. */
  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_imputado' })
  montoImputado!: number;

  /** Movimiento consolidado que cubre esta linea (si fuente = CAJA_MAYOR). */
  @Column({ type: 'int', name: 'caja_mayor_movimiento_id', nullable: true })
  cajaMayorMovimientoId?: number;

  /** Movimiento bancario generado (si fuente = CUENTA_BANCARIA). */
  @Column({ type: 'int', name: 'movimiento_bancario_id', nullable: true })
  movimientoBancarioId?: number;

  @Column({ type: 'boolean', default: false })
  anulado!: boolean;
}
