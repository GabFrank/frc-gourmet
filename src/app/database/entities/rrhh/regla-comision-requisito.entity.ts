import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ReglaComision } from './regla-comision.entity';
import { TipoRequisitoComision } from './regla-comision-enums';

@Entity('regla_comision_requisitos')
export class ReglaComisionRequisito extends BaseModel {
  @ManyToOne(() => ReglaComision, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'regla_comision_id' })
  reglaComision!: ReglaComision;

  @Column({ name: 'tipo', type: 'varchar', enum: TipoRequisitoComision })
  tipo!: TipoRequisitoComision;

  @Column({ name: 'umbral', type: 'decimal', precision: 18, scale: 2 })
  umbral!: number;

  @Column({ name: 'peso', type: 'decimal', precision: 18, scale: 2, default: 1 })
  peso!: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  descripcion?: string;
}
