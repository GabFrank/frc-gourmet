import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { PdvMesa } from './pdv-mesa.entity';

/**
 * Entity representing a sector (area of tables)
 */
@Entity('sectores')
export class Sector extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('PdvMesa', 'sector')
  mesas?: PdvMesa[];
} 