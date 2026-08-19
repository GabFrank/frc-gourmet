import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from './moneda.entity';
import { Usuario } from '../personas/usuario.entity';
import { PagoConcepto, PagoConsolidadoEstado } from './pago-consolidado-enums';

/**
 * Cabecera de un pago consolidado: un solo evento que salda N obligaciones del
 * MISMO concepto (compras / gastos / vales / liquidacion de sueldo), cobrando con
 * N lineas de pago (multi-moneda x multi-forma, Caja Mayor o cuenta bancaria).
 *
 * El desglose vive en PagoConsolidadoDetalle, que tiene una fila por
 * (obligacion x linea de pago) — asi se puede responder tanto "cuanto recibio
 * cada obligacion" como "de donde salio cada guarani".
 *
 * Los movimientos fisicos se consolidan: un CajaMayorMovimiento por grupo
 * (fuente, caja/cuenta, moneda, forma de pago), con `pagoConsolidadoId` apuntando
 * aca. Ese movimiento NO se puede anular por separado: se anula el evento entero
 * con `anular-pago-consolidado`.
 */
@Entity('pagos_consolidados')
export class PagoConsolidado extends BaseModel {
  @Column({ name: 'fecha' })
  fecha!: Date;

  @Column({ type: 'varchar', length: 30, enum: PagoConcepto })
  concepto!: PagoConcepto;

  /**
   * Etiqueta compuesta al crear ("PAGO CONSOLIDADO DE 3 GASTOS"). Con N > 1 no
   * puede nombrar a las N obligaciones: para eso esta el dialogo de detalle.
   */
  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  /** Moneda comun de las obligaciones del evento. `montoTotal` esta en ella. */
  @ManyToOne(() => Moneda, { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_deuda_id' })
  monedaDeuda!: Moneda;

  @Column({ type: 'int', name: 'moneda_deuda_id' })
  monedaDeudaId!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_total', default: 0 })
  montoTotal!: number;

  @Column({ type: 'int', name: 'cantidad_items', default: 0 })
  cantidadItems!: number;

  @ManyToOne(() => Usuario, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'responsable_id' })
  responsable?: Usuario;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ type: 'varchar', length: 30, enum: PagoConsolidadoEstado, default: PagoConsolidadoEstado.ACTIVO })
  estado!: PagoConsolidadoEstado;

  @Column({ type: 'varchar', length: 255, name: 'motivo_anulacion', nullable: true })
  motivoAnulacion?: string;

  @Column({ name: 'fecha_anulacion', nullable: true })
  fechaAnulacion?: Date;

  @OneToMany('PagoConsolidadoDetalle', 'pagoConsolidado')
  detalles?: any[];
}
