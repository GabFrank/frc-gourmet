import { Entity, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { PdvGrupoCategoria } from './pdv-grupo-categoria.entity';

@Entity('pdv_categoria')
export class PdvCategoria extends BaseModel {
  @Column({ nullable: false })
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  // Foreign keys
  @Column({ nullable: true })
  grupoCategoriId?: number;

  // Relationships
  @ManyToOne('PdvGrupoCategoria', 'categorias')
  @JoinColumn({ name: 'grupoCategoriId' })
  grupoCategoria?: PdvGrupoCategoria;

  // Use string reference to prevent circular dependencies
  @OneToMany('PdvCategoriaItem', 'categoria')
  items?: any[];
}

// Import after the class declaration to avoid circular dependencies
import { PdvCategoriaItem } from './pdv-categoria-item.entity'; 