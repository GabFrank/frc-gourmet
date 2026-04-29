import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('motivos_vale')
export class MotivoVale extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;
}
