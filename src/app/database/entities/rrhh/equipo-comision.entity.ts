import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('equipos_comision')
export class EquipoComision extends BaseModel {
  @Column({ type: 'varchar', length: 200 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;
}
