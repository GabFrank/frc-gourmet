import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Egreso de efectivo de la **caja de venta** (PdV) por un vale o una compra
 * pagados directamente desde el cajón (Utilitarios del PdV). Análogo a
 * `GastoCaja` pero para vales/compras: descuenta del cajón y aparece en el
 * resumen de cierre. NO pasa por Caja Mayor.
 *
 * El objeto de dominio (Vale / CuentaPorPagarCuota) sigue siendo la fuente de
 * verdad de la obligación; esta fila solo registra la salida de efectivo y
 * apunta de vuelta con `valeId` / `cuentaPorPagarCuotaId`.
 */
@Entity('egresos_caja')
export class EgresoCaja extends BaseModel {
  @ManyToOne('Caja', { nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'caja_id' })
  caja!: any;

  /** VALE | COMPRA */
  @Column({ type: 'varchar', length: 20 })
  tipo!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @ManyToOne('Moneda', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: any;

  @ManyToOne('FormasPago', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'forma_pago_id' })
  formaPago?: any;

  /** Referencia al Vale pagado (si tipo = VALE). */
  @Column({ name: 'vale_id', type: 'int', nullable: true })
  valeId?: number;

  /**
   * true si este egreso CREÓ el vale (crear-vale-caja) → al anular, el vale se
   * ANULA. false si solo pagó un vale ya SOLICITADO (pagar-vale-caja) → al anular,
   * el vale vuelve a SOLICITADO (queda pendiente de pago). Solo aplica a tipo VALE.
   */
  @Column({ name: 'vale_creado', default: false })
  valeCreado!: boolean;

  /** Referencia a la cuota de CPP pagada (si tipo = COMPRA). */
  @Column({ name: 'cuenta_por_pagar_cuota_id', type: 'int', nullable: true })
  cuentaPorPagarCuotaId?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion?: string;

  @Column({ name: 'fecha' })
  fecha!: Date;

  /** ACTIVO | ANULADO */
  @Column({ type: 'varchar', default: 'ACTIVO' })
  estado!: string;

  @Column({ name: 'motivo_anulacion', type: 'text', nullable: true })
  motivoAnulacion?: string;
}
