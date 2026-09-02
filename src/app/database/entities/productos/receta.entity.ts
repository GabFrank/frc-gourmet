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
  // El nombre de columna es snake_case porque así lo creó la migración
  // AddRecetaPreparacion (tiempo_preparo). Sin `name:` explícito TypeORM usaría
  // "tiempoPreparo" y el join a receta en search-productos-by-nombre fallaba con
  // "no existe la columna ... tiempoPreparo".
  @Column({ name: 'tiempo_preparo', type: 'int', nullable: true })
  tiempoPreparo?: number;

  // Foto del producto final (protocolo app://producto-images/<file>).
  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Virtual property for principal sale price
  precioPrincipal?: number;

  // Virtual: producto al que esta vinculada esta receta, resuelto por
  // `producto.receta_id` (la fuente de verdad real del vinculo 1:1).
  // Lo llenan `get-receta` y `get-recetas-with-filters`. Usar ESTE campo, no
  // `producto` (ver abajo).
  productoVinculado?: { id: number; nombre: string } | null;

  // Relationships
  // ⚠️ DEPRECADO: la columna `receta.producto_id` NO se escribe desde ninguna
  // parte de la app y es siempre NULL. Nacio junto con `Producto.receta` en el
  // refactor de 2026-03 como un 1:1 con DOS owning sides (cada uno con su
  // propia columna), y solo prospero `producto.receta_id`.
  // Para "el producto de esta receta" usar la virtual `productoVinculado`.
  // Para las recetas de un producto CON variaciones, usar `productoVariacion`.
  // No se borra la columna porque las migraciones del proyecto son aditivas.
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
