import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { DrPremio } from './dr-premio.entity';

@Entity('dr_criterio')
export class DrCriterio extends BaseModel {
  @ManyToOne(() => DrPremio, (p) => p.criterios, { nullable: false })
  @JoinColumn({ name: 'premio_id' })
  premio!: DrPremio;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ name: 'escala_min', type: 'integer', default: 0 })
  escalaMin!: number;

  @Column({ name: 'escala_max', type: 'integer', default: 2 })
  escalaMax!: number;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
