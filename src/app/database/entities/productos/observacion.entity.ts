import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing an observation
 */
@Entity('observaciones')
export class Observacion extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;
} 