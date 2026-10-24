import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../../base.entity';
import { DrGravedad } from './dr-gravedad.entity';
import { DrGrupo } from './dr-grupo.entity';

@Entity('dr_tipo_error')
export class DrTipoError extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ type: 'varchar', length: 60, nullable: true })
  area?: string | null;

  @ManyToOne(() => DrGravedad, { nullable: false })
  @JoinColumn({ name: 'gravedad_id' })
  gravedad!: DrGravedad;

  @ManyToOne(() => DrGrupo, { nullable: true })
  @JoinColumn({ name: 'grupo_id' })
  grupo?: DrGrupo | null;

  @Column({ type: 'integer', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
