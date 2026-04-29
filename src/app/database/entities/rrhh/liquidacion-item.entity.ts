import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { LiquidacionSueldo } from './liquidacion-sueldo.entity';
import { LiquidacionConcepto } from './liquidacion-concepto.entity';
import { LiquidacionItemTipo } from './liquidacion-item-tipo.enum';

@Entity('liquidacion_items')
export class LiquidacionItem extends BaseModel {
  @ManyToOne(() => LiquidacionSueldo, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'liquidacion_id' })
  liquidacion!: LiquidacionSueldo;

  @ManyToOne(() => LiquidacionConcepto, { nullable: true })
  @JoinColumn({ name: 'concepto_id' })
  concepto?: LiquidacionConcepto;

  @Column()
  descripcion!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  monto!: number;

  @Column({
    type: 'text',
    enum: LiquidacionItemTipo,
    default: LiquidacionItemTipo.HABER,
  })
  tipo!: LiquidacionItemTipo;

  @Column({ name: 'referencia_id', type: 'int', nullable: true })
  referenciaId?: number;

  @Column({ name: 'referencia_tipo', nullable: true })
  referenciaTipo?: string;

  @Column({ default: false })
  manual!: boolean;

  @Column({ nullable: true })
  observacion?: string;
}
