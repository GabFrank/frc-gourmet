import { Column, Entity, ManyToOne, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Reserva } from './reserva.entity';
import { Sector } from './sector.entity';
import type { Venta } from './venta.entity';

/**
 * Enum for table states
 */
export enum PdvMesaEstado {
  DISPONIBLE = 'DISPONIBLE',
  OCUPADO = 'OCUPADO'
}

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

  @Column({
    type: 'varchar',
    enum: PdvMesaEstado,
    default: PdvMesaEstado.DISPONIBLE
  })
  estado!: PdvMesaEstado;

  @ManyToOne(() => Reserva, { nullable: true })
  @JoinColumn({ name: 'reserva_id' })
  reserva?: Reserva;
  
  @ManyToOne(() => Sector, sector => sector.mesas, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector?: Sector;
  
  @OneToOne('Venta', 'mesa', { nullable: true })
  venta?: Venta;
} 