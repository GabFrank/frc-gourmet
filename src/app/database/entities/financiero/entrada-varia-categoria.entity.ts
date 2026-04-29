import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('entradas_varias_categorias')
export class EntradaVariaCategoria extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @ManyToOne('EntradaVariaCategoria', 'hijos', { nullable: true })
  @JoinColumn({ name: 'padre_id' })
  padre?: EntradaVariaCategoria;

  @OneToMany('EntradaVariaCategoria', 'padre')
  hijos?: EntradaVariaCategoria[];

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icono?: string;
}
