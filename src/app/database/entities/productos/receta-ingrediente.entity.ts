import { Entity, Column, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { Receta } from './receta.entity';
import { Producto } from './producto.entity';

@Entity('receta_ingrediente')
export class RecetaIngrediente extends BaseModel {
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  cantidad?: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unidad?: string; // 'GRAMOS', 'UNIDADES', 'ML', etc.

  // Descripción libre para un ítem sin ingrediente vinculado todavía (ej. "KIT DE
  // CARNES"). Más adelante se le puede asignar el Producto real. Al menos uno de
  // `ingrediente` o `descripcion` debe estar presente.
  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  unidadOriginal?: string; // Unidad seleccionada por el usuario (para conversiones)

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoUnitario!: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoTotal!: number;

  @Column({ type: 'boolean', default: false })
  esExtra!: boolean;

  @Column({ type: 'boolean', default: false })
  esOpcional!: boolean;

  @Column({ type: 'boolean', default: false })
  esCambiable!: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  costoExtra?: number;

  // ✅ NUEVO: Campo para registrar el porcentaje de aprovechamiento (pérdidas/mermas)
  @Column({ type: 'decimal', precision: 5, scale: 2, default: 100.00 })
  porcentajeAprovechamiento!: number; // 100.00 = 100% aprovechamiento, 80.00 = 80% aprovechamiento

  @Column({ type: 'boolean', default: false })
  esIngredienteBase!: boolean; // True si el ingrediente es parte del "Sabor" base

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  // Relationships
  @ManyToOne('Receta', 'ingredientes')
  @JoinColumn({ name: 'receta_id' })
  receta!: Receta;

  @ManyToOne(() => Producto, { nullable: true })
  @JoinColumn({ name: 'ingrediente_id' })
  ingrediente?: Producto | null;

  @ManyToOne(() => Producto, { nullable: true })
  @JoinColumn({ name: 'reemplazo_default_id' })
  reemplazoDefault?: Producto;
}
