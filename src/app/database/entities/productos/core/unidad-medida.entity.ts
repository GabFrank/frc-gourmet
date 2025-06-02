import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../../base.entity';

/**
 * Tipos de medida unificados para todo el sistema
 */
export enum TipoUnidadMedida {
  // Medidas de masa
  GRAMO = 'GRAMO',
  KILOGRAMO = 'KILOGRAMO',
  
  // Medidas de volumen
  MILILITRO = 'MILILITRO',
  LITRO = 'LITRO',
  
  // Medidas de unidad
  UNIDAD = 'UNIDAD',
  PAQUETE = 'PAQUETE',
  CAJA = 'CAJA',
  BOLSA = 'BOLSA',
  
  // Medidas de área (para pizzas, etc)
  CENTIMETRO_CUADRADO = 'CENTIMETRO_CUADRADO',
  
  // Medidas de longitud
  CENTIMETRO = 'CENTIMETRO',
  METRO = 'METRO'
}

/**
 * Categorías de medidas para agrupación lógica
 */
export enum CategoriaMedida {
  MASA = 'MASA',
  VOLUMEN = 'VOLUMEN',
  UNIDAD = 'UNIDAD',
  AREA = 'AREA',
  LONGITUD = 'LONGITUD'
}

/**
 * Entity representing a unified measurement unit
 */
@Entity('unidades_medida')
export class UnidadMedida extends BaseModel {
  @Column()
  nombre!: string;

  @Column()
  simbolo!: string;

  @Column({
    type: 'varchar',
    enum: TipoUnidadMedida
  })
  tipo!: TipoUnidadMedida;

  @Column({
    type: 'varchar',
    enum: CategoriaMedida
  })
  categoria!: CategoriaMedida;

  @Column({ type: 'decimal', precision: 15, scale: 6, default: 1 })
  factorConversionBase!: number; // Factor para convertir a la unidad base de la categoría

  @Column({ default: false })
  esUnidadBase!: boolean; // true para gramo, litro, unidad, etc.

  @Column({ default: true })
  activo!: boolean;
} 