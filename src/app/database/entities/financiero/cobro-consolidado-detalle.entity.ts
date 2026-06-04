import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CobroConsolidado } from './cobro-consolidado.entity';
import { Cliente } from '../personas/cliente.entity';

/**
 * Detalle por cliente de un cobro consolidado. Guarda lo cobrado a ese cliente y
 * el saldo que tenia antes del cobro (para el recibo/comprobante).
 */
@Entity('cobros_consolidados_detalles')
export class CobroConsolidadoDetalle extends BaseModel {
  @ManyToOne(() => CobroConsolidado, { nullable: false })
  @JoinColumn({ name: 'cobro_consolidado_id' })
  cobroConsolidado!: CobroConsolidado;

  @ManyToOne(() => Cliente, { nullable: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente!: Cliente;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'monto_cobrado', default: 0 })
  montoCobrado!: number;

  @Column({ type: 'decimal', precision: 18, scale: 2, name: 'saldo_anterior', default: 0 })
  saldoAnterior!: number;
}
