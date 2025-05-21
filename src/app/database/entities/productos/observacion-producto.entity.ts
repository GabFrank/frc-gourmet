import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Producto } from './producto.entity';
import type { Observacion } from './observacion.entity';

/**
 * Entity representing a product observation relationship
 */
@Entity('observaciones_productos')
export class ObservacionProducto extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne('Producto', 'observacionesProductos', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'observacion_id' })
  observacionId!: number;

  @ManyToOne('Observacion', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'observacion_id' })
  observacion!: Observacion;

  @Column({ default: false })
  obligatorio!: boolean;

  @Column({ name: 'cantidad_default', type: 'int', nullable: true })
  cantidadDefault?: number;

  @Column({ default: true })
  activo!: boolean;
} 