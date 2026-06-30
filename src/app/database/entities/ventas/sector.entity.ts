import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { PdvMesa } from './pdv-mesa.entity';

/**
 * Tipo de sector: separa los sectores de MESA (agrupan mesas, zona del salón)
 * de los de IMPRESION (cocina/barra: ruteo de comandas, impresoras y KDS).
 * Cada selector de sector filtra por el tipo que le corresponde.
 */
export enum SectorTipo {
  MESA = 'MESA',
  IMPRESION = 'IMPRESION',
}

/**
 * Entity representing a sector (area of tables / routing de impresión)
 */
@Entity('sectores')
export class Sector extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  // MESA por default: las instalaciones existentes (sin este campo) quedan como
  // sectores de mesa; los de cocina/impresión se recrean tipados (IMPRESION).
  @Column({ type: 'varchar', length: 20, default: SectorTipo.MESA })
  tipo!: SectorTipo;

  @OneToMany('PdvMesa', 'sector')
  mesas?: PdvMesa[];
}
