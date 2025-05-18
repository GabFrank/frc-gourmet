import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { RecetaItem } from './receta-item.entity';
import type { RecetaVariacion } from './receta-variacion.entity';
import { TipoMedida } from './ingrediente.entity';

/**
 * Entity representing a product recipe
 */
@Entity('producto_recetas')
export class Receta extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  modo_preparo?: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({
    type: 'varchar',
    name: 'tipo_medida',
    enum: TipoMedida,
    default: TipoMedida.UNIDAD
  })
  tipoMedida!: TipoMedida;

  @Column({ name: 'calcular_cantidad', default: false })
  calcularCantidad!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  cantidad!: number;

  @OneToMany('RecetaItem', 'receta')
  items!: RecetaItem[];

  // delete all receta variaciones when the receta is deleted
  @OneToMany('RecetaVariacion', 'receta')
  variaciones!: RecetaVariacion[];
}
