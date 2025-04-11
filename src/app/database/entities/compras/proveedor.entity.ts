import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Persona } from '../personas/persona.entity';
// Import type references to avoid circular dependencies
import type { Compra } from './compra.entity';
import type { ProveedorProducto } from './proveedor-producto.entity';

/**
 * Entity representing a supplier (proveedor)
 */
@Entity('proveedores')
export class Proveedor extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  razon_social?: string | null;

  @Column({ nullable: true })
  ruc?: string | null;

  @Column({ nullable: true })
  telefono?: string | null;

  @Column({ nullable: true })
  direccion?: string | null;

  @Column({ default: true })
  activo!: boolean;

  // Optional relationship with persona
  @ManyToOne(() => Persona, { nullable: true })
  @JoinColumn({ name: 'persona_id' })
  persona?: Persona | null;

  // Relationships - Use string references to avoid circular dependencies
  @OneToMany('Compra', 'proveedor')
  compras!: Compra[];

  @OneToMany('ProveedorProducto', 'proveedor')
  proveedorProductos!: ProveedorProducto[];
}
