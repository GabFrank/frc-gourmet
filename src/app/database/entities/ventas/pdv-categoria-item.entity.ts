import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PdvCategoria } from './pdv-categoria.entity';

@Entity('pdv_categoria_item')
export class PdvCategoriaItem extends BaseModel {
  @Column({ nullable: false })
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ nullable: true, type: 'text' })
  imagen?: string;

  // Foreign keys
  @Column({ nullable: true })
  categoriaId?: number;

  // Relationships
  @ManyToOne(() => PdvCategoria, (categoria) => categoria.items, { nullable: true })
  @JoinColumn({ name: 'categoriaId' })
  categoria?: PdvCategoria;

  // Use string reference to prevent circular dependencies
  @OneToMany('PdvItemProducto', 'categoriaItem')
  productos?: any[];
}

// Import after the class declaration to avoid circular dependencies
import { PdvItemProducto } from './pdv-item-producto.entity'; 