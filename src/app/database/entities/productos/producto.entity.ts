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

  @Column({ type: 'boolean', default: true, name: 'requiere_comanda', comment: 'Si false, el producto NO genera ticket de comanda al ticketear en PdV. Para servicio, propina, descuento, etc.' })
  requiereComanda!: boolean;

  // IVA del producto en porcentaje (0, 5, 10). Pensado para futura facturación electrónica (SIFEN).
  @Column({ type: 'int', default: 10 })
  iva!: number;

  // --- Campos de Control de Stock ---
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, comment: 'Stock mínimo para alertas' })
  stockMinimo?: number;

  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, comment: 'Stock máximo para control' })
  stockMaximo?: number;

  // --- Campos de Buffet por peso (solo BUFFET_POR_PESO) ---
  // Peso del plato/recipiente a descontar del peso bruto (en gramos).
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, name: 'tara_gramos', comment: 'Peso del plato a descontar (gramos)' })
  taraGramos?: number;

  // Peso neto mínimo para cobrar (gramos). Si el plato pesa menos, se cobra
  // igual el precio mínimo (decisión del negocio).
  @Column({ type: 'decimal', precision: 10, scale: 3, nullable: true, name: 'peso_minimo_gramos', comment: 'Peso mínimo para cobrar (gramos)' })
  pesoMinimoGramos?: number;

  // Gancho híbrido: si true, la venta descuenta ingredientes prorrateados por
  // receta en vez del propio producto buffet. Default false (stock por producción).
  @Column({ type: 'boolean', default: false, name: 'descuenta_por_receta', comment: 'Buffet: descontar stock por receta en vez del propio producto' })
  descuentaPorReceta!: boolean;

  // Indica si el registro está completo (precios, recetas, clasificación final).
  // Productos creados desde importación OCR/IA arrancan en false hasta que el usuario completa.
  @Column({ type: 'boolean', default: true, name: 'registro_completo' })
  registroCompleto!: boolean;

  // Imagen principal — URL `app://producto-images/<file>`. Las derivadas
  // (thumb 96px, medium 400px) se infieren con el helper image-url.util.ts.
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'image_url' })
  imageUrl?: string;

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

  // Sectores en los que se imprime la comanda. M2M con `ProductoSector` —
  // permite que un producto se imprima en múltiples impresoras al mismo
  // tiempo (cocina + control gerencial, por ejemplo). Ver
  // `producto-sector.entity.ts` para la justificación del modelo.
  @OneToMany('ProductoSector', 'producto')
  sectores?: any[];
}
