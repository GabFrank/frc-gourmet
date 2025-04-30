import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Reserva } from './reserva.entity';
import { Sector } from './sector.entity';

/**
 * Entity representing a point of sale table
 */
@Entity('pdv_mesas')
export class PdvMesa extends BaseModel {
  @Column()
  numero!: number;

  @Column({ type: 'int', default: 4, nullable: true })
  cantidad_personas?: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  reservado!: boolean;

  @ManyToOne(() => Reserva, { nullable: true })
  @JoinColumn({ name: 'reserva_id' })
  reserva?: Reserva;
  
  @ManyToOne(() => Sector, sector => sector.mesas, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector?: Sector;
} 