import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { LiquidacionFinal } from './liquidacion-final.entity';
import { LiquidacionItemTipo } from './liquidacion-item-tipo.enum';

@Entity('liquidacion_final_items')
export class LiquidacionFinalItem extends BaseModel {
  @ManyToOne(() => LiquidacionFinal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'liquidacion_final_id' })
  liquidacionFinal!: LiquidacionFinal;

  @Column()
  concepto!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ nullable: true })
  descripcion?: string;

  // HABER (indemnización, vacaciones, aguinaldo) o DESCUENTO (deudas neteadas).
  @Column({ type: 'varchar', enum: LiquidacionItemTipo, default: LiquidacionItemTipo.HABER })
  tipo!: LiquidacionItemTipo;

  // Para los descuentos: qué deuda liquida (VALE | CPP_CUOTA | CPC_CUOTA) y su id,
  // para poder saldarla al pagar la liquidación final.
  @Column({ name: 'referencia_tipo', type: 'varchar', nullable: true })
  referenciaTipo?: string;

  @Column({ name: 'referencia_id', type: 'int', nullable: true })
  referenciaId?: number;
}
