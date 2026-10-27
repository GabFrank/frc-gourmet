import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { FtTarea } from './ft-tarea.entity';
import { FtPlantillaItem } from './ft-plantilla-item.entity';

/** Estado de un ítem del checklist en una tarea concreta (texto en snapshot). */
@Entity('ft_tarea_item')
export class FtTareaItem extends BaseModel {
  @ManyToOne(() => FtTarea, (t) => t.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tarea_id' })
  tarea!: FtTarea;

  @ManyToOne(() => FtPlantillaItem, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'item_id' })
  item?: FtPlantillaItem | null;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ default: false })
  hecho!: boolean;

  @Column({ name: 'hecho_en', nullable: true })
  hechoEn?: Date;
}
