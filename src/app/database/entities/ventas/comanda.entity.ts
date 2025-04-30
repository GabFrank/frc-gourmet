import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PdvMesa } from './pdv-mesa.entity';

/**
 * Entity representing an order
 */
@Entity('comandas')
export class Comanda extends BaseModel {
  @Column()
  codigo!: string;

  @ManyToOne(() => PdvMesa)
  @JoinColumn({ name: 'pdv_mesa_id' })
  pdv_mesa!: PdvMesa;

  @Column({ default: true })
  activo!: boolean;
} 