import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { ProductoBase } from './producto-base.entity';
import type { UnidadMedida } from './unidad-medida.entity';
import type { Moneda } from '../../financiero/moneda.entity';
import type { Receta } from '../recetas/receta.entity';

/**
 * Origen del ingrediente
 */
export enum OrigenIngrediente {
  COMPRADO = 'COMPRADO',        // Comprado directamente del proveedor
  ELABORADO = 'ELABORADO'       // Elaborado en cocina con receta
}

/**
 * Entity representing an ingredient
 */
@Entity('ingredientes')
export class Ingrediente extends BaseModel {
  @Column({ name: 'producto_base_id' })
  productoBaseId!: number;

  @ManyToOne('ProductoBase', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_base_id' })
  productoBase!: ProductoBase;

  @Column({
    type: 'varchar',
    name: 'origen',
    enum: OrigenIngrediente
  })
  origen!: OrigenIngrediente;

  // Unidad de medida base para este ingrediente
  @Column({ name: 'unidad_medida_id' })
  unidadMedidaId!: number;

  @ManyToOne('UnidadMedida', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'unidad_medida_id' })
  unidadMedida!: UnidadMedida;

  // Costo por unidad de medida
  @Column({ type: 'decimal', precision: 10, scale: 4 })
  costoPorUnidad!: number;

  @Column({ name: 'moneda_id' })
  monedaId!: number;

  @ManyToOne('Moneda', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'moneda_id' })
  moneda!: Moneda;

  // Rendimiento y merma
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  porcentajeMerma!: number; // Porcentaje de desperdicio en la preparación

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  rendimiento!: number; // Cantidad que rinde en la unidad de medida

  // Para ingredientes elaborados
  @Column({ name: 'receta_elaboracion_id', nullable: true })
  recetaElaboracionId?: number;

  @ManyToOne('Receta', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_elaboracion_id' })
  recetaElaboracion?: Receta;

  // Información de stock
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  stockActual!: number;

  @Column({ type: 'decimal', precision: 10, scale: 4, default: 0 })
  stockMinimo!: number;

  @Column({ default: true })
  activo!: boolean;

  // Campos calculados
  costoConMerma?: number; // Costo considerando la merma
} 