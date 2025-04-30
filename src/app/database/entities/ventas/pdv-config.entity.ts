import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PdvGrupoCategoria } from './pdv-grupo-categoria.entity';

@Entity('pdv_config')
export class PdvConfig extends BaseModel {
  @Column({ nullable: false, default: 0 })
  cantidad_mesas!: number;

  // Foreign key
  @Column({ nullable: true })
  pdvGrupoCategoriaId?: number;

  // Relationship
  @ManyToOne(() => PdvGrupoCategoria, { nullable: true })
  @JoinColumn({ name: 'pdvGrupoCategoriaId' })
  pdvGrupoCategoria?: PdvGrupoCategoria;
} 