import { Column, Entity, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

@Entity('operaciones_financieras_categorias')
export class OperacionFinancieraCategoria extends BaseModel {
  @Column({ type: 'varchar', length: 100 })
  nombre!: string;

  @ManyToOne('OperacionFinancieraCategoria', 'hijos', { nullable: true })
  @JoinColumn({ name: 'padre_id' })
  padre?: OperacionFinancieraCategoria;

  @OneToMany('OperacionFinancieraCategoria', 'padre')
  hijos?: OperacionFinancieraCategoria[];

  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'varchar', length: 50, nullable: true })
  icono?: string;
}
