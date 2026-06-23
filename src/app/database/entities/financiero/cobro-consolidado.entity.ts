import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Convenio } from '../personas/convenio.entity';
import { CobroConsolidadoEstado, CobroConsolidadoFuente } from './cobro-consolidado-enums';

/**
 * Cabecera de un cobro consolidado: la empresa de un convenio paga de una sola vez
 * la deuda de varios de sus clientes/funcionarios. Cada CobroConsolidadoDetalle
 * registra lo cobrado a un cliente. El ingreso entra a Caja Mayor (INGRESO_COBRO_
 * CLIENTE) o acredita una cuenta bancaria segun la fuente.
 */
@Entity('cobros_consolidados')
export class CobroConsolidado extends BaseModel {
  @ManyToOne(() => Convenio, { nullable: false })
  @JoinColumn({ name: 'convenio_id' })
  convenio!: Convenio;

  @Column({ name: 'fecha' })
  fecha!: Date;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_total', default: 0 })
  montoTotal!: number;

  @Column({ type: 'int', name: 'cantidad_clientes', default: 0 })
  cantidadClientes!: number;

  @Column({ type: 'varchar', length: 30, enum: CobroConsolidadoFuente, default: CobroConsolidadoFuente.CAJA_MAYOR })
  fuente!: CobroConsolidadoFuente;

  // Origen del ingreso (segun fuente). Columnas planas para evitar FKs estrictas.
  @Column({ type: 'int', name: 'caja_mayor_id', nullable: true })
  cajaMayorId?: number;

  @Column({ type: 'int', name: 'moneda_id', nullable: true })
  monedaId?: number;

  @Column({ type: 'int', name: 'forma_pago_id', nullable: true })
  formaPagoId?: number;

  @Column({ type: 'int', name: 'cuenta_bancaria_id', nullable: true })
  cuentaBancariaId?: number;

  @Column({ type: 'text', nullable: true })
  observacion?: string;

  @Column({ type: 'varchar', length: 30, enum: CobroConsolidadoEstado, default: CobroConsolidadoEstado.ACTIVO })
  estado!: CobroConsolidadoEstado;

  @OneToMany('CobroConsolidadoDetalle', 'cobroConsolidado')
  detalles?: any[];
}
