import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';
import type { RecetaItem } from './receta-item.entity';
import type { RecetaVariacionItem } from './receta-variacion-item.entity';
import type { IntercambioIngrediente } from './intercambio-ingrediente.entity';
import type { Moneda } from '../financiero/moneda.entity';

/**
 * Tipo de medida para los ingredientes
 */
export enum TipoMedida {
  UNIDAD = 'UNIDAD',
  KILO = 'KILO',
  GRAMO = 'GRAMO',
  LITRO = 'LITRO',
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

  @Column({ name: 'receta_cantidad', type: 'decimal', precision: 10, scale: 2, default: 0, nullable: true })
  recetaCantidad?: number;

  @Column({ name: 'moneda_id', nullable: true })
  monedaId?: number;

  @ManyToOne('Moneda', { nullable: true })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda;

  @OneToMany('RecetaItem', 'ingrediente')
  recetaItems!: RecetaItem[];

  @OneToMany('RecetaVariacionItem', 'ingrediente')
  variacionItems!: RecetaVariacionItem[];

  @OneToMany('IntercambioIngrediente', 'ingredienteOriginal')
  intercambiosOrigen!: IntercambioIngrediente[];

  @OneToMany('IntercambioIngrediente', 'ingredienteReemplazo')
  intercambiosReemplazo!: IntercambioIngrediente[];
}
