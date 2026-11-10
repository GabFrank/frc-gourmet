import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Familia } from './familia.entity';
import { Producto } from './producto.entity';

@Entity('subfamilia')
export class Subfamilia extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  /** Clase de ítem de compra por defecto de sus productos (CompraItemClase). */
  @Column({ name: 'clase_id', type: 'int', nullable: true })
  claseId?: number | null;

  // Relationships
  @ManyToOne(() => Familia, familia => familia.subfamilias)
  @JoinColumn({ name: 'familia_id' })
  familia!: Familia;

  @OneToMany(() => Producto, producto => producto.subfamilia)
  productos?: Producto[];
} 