import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Categoria } from './categoria.entity';
import type { Producto } from './producto.entity';

/**
 * Entity representing a product subcategory
 */
@Entity('subcategorias')
export class Subcategoria extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: 0 })
  posicion!: number;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'categoria_id' })
  categoriaId!: number;

  @ManyToOne('Categoria')
  @JoinColumn({ name: 'categoria_id' })
  categoria!: Categoria;

  @OneToMany('Producto', 'subcategoria')
  productos?: Producto[];
} 

