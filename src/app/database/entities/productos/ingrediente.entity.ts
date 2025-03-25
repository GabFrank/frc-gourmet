import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';
import type { RecetaItem } from './receta-item.entity';
import type { IntercambioIngrediente } from './intercambio-ingrediente.entity';

/**
 * Tipo de medida para los ingredientes
 */
export enum TipoMedida {
  UNIDAD = 'UNIDAD',
  GRAMO = 'GRAMO',
  MILILITRO = 'MILILITRO',
  PAQUETE = 'PAQUETE'
}

/**
 * Entity representing a product ingredient
 */
@Entity('producto_ingredientes')
export class Ingrediente extends BaseModel {
  @Column()
  descripcion!: string;

  @Column({
    type: 'varchar',
    name: 'tipo_medida',
    enum: TipoMedida,
    default: TipoMedida.UNIDAD
  })
  tipoMedida!: TipoMedida;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costo!: number;

  @Column({ name: 'is_produccion', default: false })
  isProduccion!: boolean;

  @Column({ default: true })
  activo!: boolean;

  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  @OneToMany('RecetaItem', 'ingrediente')
  recetaItems!: RecetaItem[];

  @OneToMany('IntercambioIngrediente', 'ingredienteOriginal')
  intercambiosOrigen!: IntercambioIngrediente[];

  @OneToMany('IntercambioIngrediente', 'ingredienteReemplazo')
  intercambiosReemplazo!: IntercambioIngrediente[];
}
