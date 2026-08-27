import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Moneda } from '../financiero/moneda.entity';
import { FormasPago } from './forma-pago.entity';
// Import type reference to avoid circular dependency
import type { Pago } from './pago.entity';

/**
 * Enum for payment detail types
 */
export enum TipoDetalle {
  PAGO = 'PAGO',            // Regular payment
  VUELTO = 'VUELTO',        // Change given back
  DESCUENTO = 'DESCUENTO',  // Discount applied 
  AUMENTO = 'AUMENTO'       // Additional amount paid
}

// @deprecated — ver Pago entity. Solo legacy.
@Entity('pagos_detalles')
export class PagoDetalle extends BaseModel {
  @Column('decimal', { precision: 10, scale: 2 })
  valor!: number;

  @Column({ type: 'varchar', length: 255 })
  descripcion!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({
    type: 'text',
    enum: TipoDetalle,
    default: TipoDetalle.PAGO
  })
  tipo!: TipoDetalle;

  // Relationships
  @ManyToOne('Pago', 'detalles', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'pago_id' })
  pago!: Pago; // Use type import for type checking

  @ManyToOne('Moneda')
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  @ManyToOne(() => FormasPago)
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago!: FormasPago;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;

  // Preparado para vincular pagos a comandas en el futuro
  @Column({ name: 'comanda_id', nullable: true })
  comandaId?: number;

  // Ronda de cobro parcial que originó esta línea (null = cobro directo/total).
  // Permite anular una ronda desactivando sus PagoDetalle y recomputar saldo.
  @Column({ name: 'cobro_parcial_id', nullable: true })
  cobroParcialId?: number;

  // ─── Destino de la acreditación (POS / banco) ───────────────────────────
  // Al finalizar el cobro se crea una `AcreditacionPos` por cada línea con
  // máquina POS y se acredita la cuenta bancaria de cada transferencia. Hasta
  // 2026-08 ese vínculo vivía SOLO en memoria del diálogo de cobro: no se
  // persistía, así que al reabrir el diálogo (`loadExistingPago`) se perdía y
  // la acreditación no se creaba nunca — en silencio, porque el bloque que la
  // genera está en un try/catch no bloqueante.
  //
  // Con el cobro repartido entre terminales (una carga las líneas, otra
  // finaliza) ese camino pasa a ser el normal, así que el vínculo tiene que
  // sobrevivir a la recarga. Nullable: la enorme mayoría de las líneas
  // (efectivo) no tiene destino de acreditación, y las líneas históricas
  // quedan en null sin cambiar de significado.
  //
  // `type: 'int'` explícito: sobre un tipo unión (`number | null`) TypeORM no
  // puede inferir el tipo de columna y falla al arrancar con
  // "Data type Object ... is not supported". Es el pitfall registrado en la
  // skill; `cobroParcialId` de arriba se salva sólo porque es `number` a secas.
  @Column({ name: 'maquina_pos_id', type: 'int', nullable: true })
  maquinaPosId?: number | null;

  @Column({ name: 'cuenta_bancaria_id', type: 'int', nullable: true })
  cuentaBancariaId?: number | null;
}
