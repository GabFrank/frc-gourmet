import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Producto } from './producto.entity';
import type { Adicional } from './adicional.entity';

/**
 * Entity representing a relationship between product and additional item
 */
@Entity('productos_adicionales')
export class ProductoAdicional extends BaseModel {
  @Column({ name: 'producto_id' })
  productoId!: number;

  @ManyToOne('Producto', 'productosAdicionales')
  @JoinColumn({ name: 'producto_id' })
  producto!: Producto;

  @Column({ name: 'adicional_id' })
  adicionalId!: number;

  @ManyToOne('Adicional')
  @JoinColumn({ name: 'adicional_id' })
  adicional!: Adicional;

  @Column({ name: 'cantidad_default', type: 'int', nullable: true })
  cantidadDefault?: number;

  @Column({ default: true })
  activo!: boolean;
} 