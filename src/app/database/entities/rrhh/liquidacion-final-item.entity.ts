import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { LiquidacionFinal } from './liquidacion-final.entity';

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
}
