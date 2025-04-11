import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Ingrediente } from '../productos/ingrediente.entity';
import { Producto } from '../productos/producto.entity';
// Import type references to avoid circular dependencies
import type { Compra } from './compra.entity';
import type { Proveedor } from './proveedor.entity';

/**
 * Entity representing the relationship between suppliers and products/ingredients
 */
@Entity('proveedores_productos')
export class ProveedorProducto extends BaseModel {
  @Column({ default: true })
  activo!: boolean;

  // Relationships - Use string references to avoid circular dependencies
  @ManyToOne('Proveedor', 'proveedorProductos', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor!: Proveedor;

  @ManyToOne(() => Producto, { nullable: true })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @ManyToOne(() => Ingrediente, { nullable: true })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente?: Ingrediente;

  @ManyToOne('Compra', '', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'compra_id' })
  compra?: Compra;
}
