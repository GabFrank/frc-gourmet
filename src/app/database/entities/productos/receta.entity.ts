import { Entity, Column, OneToMany, ManyToOne, JoinColumn, OneToOne, ManyToMany, JoinTable, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { RecetaIngrediente } from './receta-ingrediente.entity';
import { Producto } from './producto.entity';
import { PrecioVenta } from './precio-venta.entity';
import { PrecioCosto } from './precio-costo.entity';
import { Adicional } from './adicional.entity';
import { RecetaAdicionalVinculacion } from './receta-adicional-vinculacion.entity';
import type { RecetaPresentacion } from './receta-presentacion.entity';

@Entity('receta')
export class Receta extends BaseModel {

  @Index() // Index para búsquedas rápidas por categoría (sabor)
  @Column({ type: 'varchar', length: 100, nullable: true })
  categoria?: string; // Ej: "PIZZA CALABRESA", "HAMBURGUESA CLASICA"

  @Column({ type: 'varchar', length: 100, nullable: true })
  subcategoria?: string; // Ej: "GRANDE", "MEDIANA", "DOBLE CARNE"

  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoCalculado!: number;

  // ✅ NUEVO: Campos para rendimiento de la receta
  @Column({ type: 'decimal', precision: 10, scale: 4, default: 1 })
  rendimiento!: number; // Cantidad que produce la receta

  @Column({ type: 'varchar', length: 50, default: 'UNIDADES' })
  unidadRendimiento!: string; // Unidad de la cantidad producida

  @Column({ type: 'varchar', length: 50, nullable: true })
  unidadRendimientoOriginal?: string; // Unidad original seleccionada

  // Tiempo de preparo total en minutos.
  @Column({ type: 'int', nullable: true })
  tiempoPreparo?: number;

  // Foto del producto final (protocolo app://producto-images/<file>).
  @Column({ type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Virtual property for principal sale price
  precioPrincipal?: number;

  // Relationships
  @OneToOne(() => Producto, producto => producto.receta)
  @JoinColumn({ name: 'producto_id' })
  producto?: Producto;

  // ✅ NUEVA RELACIÓN: Una receta puede pertenecer a un adicional
  @OneToOne(() => Adicional, adicional => adicional.receta)
  adicional?: Adicional;

  @OneToMany('RecetaIngrediente', 'receta')
  ingredientes?: RecetaIngrediente[];

  // Fases del modo de preparo (ordenadas) y materiales/utensilios.
  @OneToMany('RecetaFase', 'receta')
  fases?: any[];

  @OneToMany('RecetaMaterial', 'receta')
  materiales?: any[];

  @OneToMany(() => PrecioVenta, precioVenta => precioVenta.receta)
  preciosVenta?: PrecioVenta[];

  @OneToMany(() => PrecioCosto, precioCosto => precioCosto.receta)
  preciosCosto?: PrecioCosto[];

  // Adicionales disponibles (muchos a muchos)
  @ManyToMany(() => Adicional, adicional => adicional.recetas)
  @JoinTable({
    name: 'receta_adicional',
    joinColumn: { name: 'receta_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'adicional_id', referencedColumnName: 'id' }
  })
  adicionalesDisponibles?: Adicional[];

  // Adicionales vinculados con precios específicos
  @OneToMany(() => RecetaAdicionalVinculacion, vinculacion => vinculacion.receta)
  adicionalesVinculados?: RecetaAdicionalVinculacion[];

  // Relación inversa: para productos ELABORADO_CON_VARIACION, cada receta pertenece a un producto vía productoVariacion
  @ManyToOne('Producto', 'recetas')
  @JoinColumn({ name: 'producto_variacion_id' })
  productoVariacion?: Producto;

  // ✅ NUEVA RELACIÓN: Una receta puede pertenecer a una variación
  @OneToOne('RecetaPresentacion', 'receta')
  variacion?: RecetaPresentacion;
}
