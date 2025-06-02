import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Subcategoria } from './subcategoria.entity';

/**
 * Entity representing a product category
 */
@Entity('categorias')
export class Categoria extends BaseModel {
  @Column({ type: 'varchar' })
  nombre!: string;

  @Column({ type: 'varchar', nullable: true })
  descripcion?: string;

  @Column({ type: 'integer', default: 0 })
  posicion!: number;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @OneToMany(() => Subcategoria, subcategoria => subcategoria.categoria)
  subcategorias?: Subcategoria[];
} 