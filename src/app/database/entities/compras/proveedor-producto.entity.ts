import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Producto } from '../productos/producto.entity';
import type { Compra } from './compra.entity';
import type { Proveedor } from './proveedor.entity';

// Unicidad (proveedor, producto) se valida en el handler `upsertProveedorProducto`.
// (No se usa @Index unique por compatibilidad con datos legacy donde producto_id puede ser NULL.)
@Entity('proveedores_productos')
export class ProveedorProducto extends BaseModel {
  @Column({ default: true })
  activo!: boolean;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true, name: 'ultimo_costo_unitario' })
  ultimoCostoUnitario?: number;

  @Column({ type: 'date', nullable: true, name: 'ultima_compra_fecha' })
  ultimaCompraFecha?: Date;

  @ManyToOne('Proveedor', 'proveedorProductos', {
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'proveedor_id' })
  proveedor!: Proveedor;

  @ManyToOne(() => Producto, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  @ManyToOne('Compra', '', {
    nullable: true,
    createForeignKeyConstraints: false
  })
  @JoinColumn({ name: 'compra_id' })
  compra?: Compra;
}
