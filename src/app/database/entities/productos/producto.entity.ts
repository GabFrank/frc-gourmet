import { Entity, Column, ManyToOne, JoinColumn, OneToMany, OneToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ProductoTipo } from './producto-tipo.enum';
import { Subfamilia } from './subfamilia.entity';
import type { Receta } from './receta.entity';
import type { Presentacion } from './presentacion.entity';
import { PrecioCosto } from './precio-costo.entity';
import type { Sabor } from './sabor.entity';

@Entity('producto')
export class Producto extends BaseModel {
  @Column({ type: 'varchar', length: 255 })
  nombre!: string;

  @Column({ type: 'varchar', length: 50 })
  tipo!: ProductoTipo;

  @Column({ type: 'varchar', length: 100, nullable: true })
  unidadBase?: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'boolean', default: true, comment: 'Indica si el producto se muestra en el punto de venta.' })
  esVendible!: boolean;

  @Column({ type: 'boolean', default: false, comment: 'Indica si el producto puede ser comprado a proveedores.' })
  esComprable!: boolean;

  @Column({ type: 'boolean', default: true, comment: 'Indica si se controla el stock del producto.' })
  controlaStock!: boolean;

  @Column({ type: 'boolean', default: false, comment: 'Indica si el producto puede ser usado como ingrediente en recetas.' })
  esIngrediente!: boolean;

  // IVA del producto en porcentaje (0, 5, 10). Pensado para futura facturación electrónica (SIFEN).
  @Column({ type: 'int', default: 10 })
  iva!: number;

  // --- Campos de Control de Stock ---
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, comment: 'Stock mínimo para alertas' })
  stockMinimo?: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, comment: 'Stock máximo para control' })
  stockMaximo?: number;

  // Indica si el registro está completo (precios, recetas, clasificación final).
  // Productos creados desde importación OCR/IA arrancan en false hasta que el usuario completa.
  @Column({ type: 'boolean', default: true, name: 'registro_completo' })
  registroCompleto!: boolean;

  // Relationships
  // Subfamilia es opcional: productos creados desde importación OCR pueden no tener
  // clasificación todavía (registro parcial). Se completa después desde gestión-producto.
  @ManyToOne(() => Subfamilia, subfamilia => subfamilia.productos, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'subfamilia_id' })
  subfamilia?: Subfamilia;

  // ⚠️ LEGACY: Mantener por compatibilidad durante migración
  @OneToOne('Receta', { nullable: true })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  @OneToMany('Presentacion', 'producto')
  presentaciones?: Presentacion[];

  @OneToMany(() => PrecioCosto, precioCosto => precioCosto.producto)
  preciosCosto?: PrecioCosto[];

  // ✅ NUEVAS RELACIONES PARA ARQUITECTURA CON VARIACIONES

  // Sabores disponibles para este producto (solo para ELABORADO_CON_VARIACION)
  @OneToMany('Sabor', 'producto')
  sabores?: Sabor[];

  // Recetas base asociadas (una por sabor para productos con variaciones)
  @OneToMany('Receta', 'productoVariacion')
  recetas?: Receta[];
}
