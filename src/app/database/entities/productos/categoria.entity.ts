import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Subcategoria } from './subcategoria.entity';

/**
 * Entity representing a product category
 */
@Entity('categorias')
export class Categoria extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: 0 })
  posicion!: number;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany(() => Subcategoria, subcategoria => subcategoria.categoria)
  subcategorias?: Subcategoria[];
} 