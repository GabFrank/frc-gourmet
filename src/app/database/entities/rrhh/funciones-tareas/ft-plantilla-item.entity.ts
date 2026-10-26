import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { FtPlantillaTarea } from './ft-plantilla-tarea.entity';

/** Ítem de un checklist. */
@Entity('ft_plantilla_item')
export class FtPlantillaItem extends BaseModel {
  @ManyToOne(() => FtPlantillaTarea, (p) => p.items, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plantilla_id' })
  plantilla!: FtPlantillaTarea;

  @Column({ type: 'text' })
  texto!: string;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  obligatorio!: boolean;
}
