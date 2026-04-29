import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { LiquidacionComision } from './liquidacion-comision.entity';
import { ReglaComision } from './regla-comision.entity';

@Entity('liquidacion_comision_items')
export class LiquidacionComisionItem extends BaseModel {
  @ManyToOne(() => LiquidacionComision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'liquidacion_comision_id' })
  liquidacion!: LiquidacionComision;

  @ManyToOne(() => ReglaComision, { nullable: true })
  @JoinColumn({ name: 'regla_comision_id' })
  reglaComision?: ReglaComision;

  @Column({ type: 'varchar', length: 300 })
  concepto!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({ name: 'es_manual', default: false })
  esManual!: boolean;

  @Column({ type: 'text', nullable: true })
  observacion?: string;
}
