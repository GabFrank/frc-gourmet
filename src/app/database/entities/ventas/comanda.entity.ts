import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PdvMesa } from './pdv-mesa.entity';
import { Sector } from './sector.entity';

export enum ComandaEstado {
  DISPONIBLE = 'DISPONIBLE',
  OCUPADO = 'OCUPADO',
}

@Entity('comandas')
export class Comanda extends BaseModel {
  @Column()
  codigo!: string;

  @Column({ type: 'int', default: 0 })
  numero!: number;

  @Column({
    type: 'varchar',
    enum: ComandaEstado,
    default: ComandaEstado.DISPONIBLE,
  })
  estado!: ComandaEstado;

  @Column({ type: 'varchar', length: 255, nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  observacion?: string;

  @ManyToOne(() => PdvMesa, { nullable: true })
  @JoinColumn({ name: 'pdv_mesa_id' })
  pdv_mesa?: PdvMesa;

  @ManyToOne(() => Sector, { nullable: true })
  @JoinColumn({ name: 'sector_id' })
  sector?: Sector;

  @Column({ default: true })
  activo!: boolean;

  // F5: device tracking — dispositivo donde se origino la comanda.
  @ManyToOne('Dispositivo', { nullable: true })
  @JoinColumn({ name: 'dispositivo_id' })
  dispositivo?: any;
}
