import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';
import type { Receta } from '../recetas/receta.entity';
import type { Moneda } from '../../financiero/moneda.entity';

/**
 * Tipos de observación
 */
export enum TipoObservacion {
  SIMPLE = 'SIMPLE',          // Observación sin costo adicional (ej: "sin cebolla")
  CON_COSTO = 'CON_COSTO',    // Observación con costo fijo (ej: "extra bacon - $5000")
  CON_RECETA = 'CON_RECETA'   // Observación con receta asociada (ej: "con salsa especial")
}

/**
 * Entity representing product observations that can be reused
 */
@Entity('observaciones')
export class Observacion extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ type: 'text', nullable: true })
  descripcion?: string;

  @Column({
    type: 'varchar',
    name: 'tipo_observacion',
    enum: TipoObservacion
  })
  tipoObservacion!: TipoObservacion;

  // Para observaciones con costo fijo
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  costoAdicional!: number;

  @Column({ name: 'moneda_id', nullable: true })
  monedaId?: number;

  @ManyToOne('Moneda', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'moneda_id' })
  moneda?: Moneda;

  // Para observaciones con receta
  @Column({ name: 'receta_id', nullable: true })
  recetaId?: number;

  @ManyToOne('Receta', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'receta_id' })
  receta?: Receta;

  // Configuración
  @Column({ default: false })
  esObligatoria!: boolean; // Si debe aparecer siempre como opción

  @Column({ default: false })
  permitePersonalizacion!: boolean; // Si el cliente puede modificar el texto

  @Column({ default: 0 })
  orden!: number; // Orden de aparición

  @Column({ default: true })
  activo!: boolean;

  // Campo calculado
  costoTotal?: number; // Incluye costo adicional + costo de receta si aplica
} 