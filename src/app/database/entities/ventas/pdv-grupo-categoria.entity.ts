import { Entity, Column, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('pdv_grupo_categoria')
export class PdvGrupoCategoria extends BaseModel {
  @Column({ nullable: false })
  nombre!: string;

  @Column({ default: true })
  activo!: boolean;

  // Relationships - using string reference to prevent circular dependencies
  @OneToMany(() => PdvCategoria, (categoria) => categoria.grupoCategoria)
  categorias?: PdvCategoria[];
}

// Import after the class declaration to avoid circular dependencies
import { PdvCategoria } from './pdv-categoria.entity'; 