import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { DrTipoFalta } from './dr-tipo-falta.entity';

@Entity('dr_checklist_item')
export class DrChecklistItem extends BaseModel {
  @ManyToOne(() => DrTipoFalta, (t) => t.checklist, { nullable: false })
  @JoinColumn({ name: 'tipo_falta_id' })
  tipoFalta!: DrTipoFalta;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
