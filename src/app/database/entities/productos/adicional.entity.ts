import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Ingrediente } from './ingrediente.entity';
import type { Receta } from './receta.entity';

/**
 * Entity representing an additional item for products
 */
@Entity('adicionales')
export class Adicional extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ name: 'ingrediente_id', nullable: true })
  ingredienteId?: number;

  @ManyToOne('Ingrediente', { nullable: true })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente?: Ingrediente;

  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  @Column({ name: 'precio_venta_unitario', type: 'decimal', precision: 10, scale: 2 })
  precioVentaUnitario!: number;

  @Column({ default: true })
  activo!: boolean;
} 