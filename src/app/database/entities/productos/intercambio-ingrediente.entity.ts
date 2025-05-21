import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Producto } from './producto.entity';
import type { Sabor } from './sabor.entity';
import type { Ingrediente } from './ingrediente.entity';

/**
 * Entity representing an ingredient swap
 */
@Entity('producto_intercambio_ingredientes')
export class IntercambioIngrediente extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne('Producto', 'intercambioIngredientes', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'sabor_id', nullable: true })
  saborId?: number;

  @ManyToOne('Sabor', 'intercambioIngredientes', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'sabor_id' })
  sabor?: Sabor;

  @Column({ name: 'ingrediente_original_id' })
  ingredienteOriginalId!: number;

  @ManyToOne('Ingrediente', 'intercambiosOrigen', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingrediente_original_id' })
  ingredienteOriginal!: Ingrediente;

  @Column({ name: 'ingrediente_reemplazo_id' })
  ingredienteReemplazoId!: number;

  @ManyToOne('Ingrediente', 'intercambiosReemplazo', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ingrediente_reemplazo_id' })
  ingredienteReemplazo!: Ingrediente;

  @Column({ name: 'costo_adicional', type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoAdicional!: number;
}
