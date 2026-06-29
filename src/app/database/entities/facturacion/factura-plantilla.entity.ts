import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Tipo de plantilla de factura segun el modelo de facturacion.
 */
export enum TipoPlantilla {
  /** Hoja ya impresa; el sistema solo posiciona texto sobre coordenadas. */
  PRE_IMPRESO = 'PRE_IMPRESO',
  /** Ticket de impresora termica (58mm/80mm). */
  AUTO_IMPRESO_TERMICA = 'AUTO_IMPRESO_TERMICA',
  /** Hoja A4 auto-impresa. */
  AUTO_IMPRESO_A4 = 'AUTO_IMPRESO_A4',
}

/**
 * Plantilla/diseno de factura creada con el disenador visual del sistema.
 *
 * `config` guarda el diseno serializado (JSON): lista de elementos con sus
 * coordenadas (mm), tipo (texto fijo / variable / tabla de items / linea /
 * imagen), binding de variable, estilo y, para tablas, la definicion de
 * columnas. Esto permite que un mismo motor de render dibuje tanto el
 * pre-impreso (posicionar sobre la hoja) como el auto-impreso (layout completo).
 */
@Entity('factura_plantillas')
export class FacturaPlantilla extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ type: 'varchar', enum: TipoPlantilla, default: TipoPlantilla.PRE_IMPRESO })
  tipo!: TipoPlantilla;

  /** Ancho de pagina en milimetros (210 para A4, 58/80 para termica). */
  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'ancho_mm', default: 210 })
  anchoMm!: number;

  /** Alto de pagina en milimetros (297 para A4; variable/continuo para termica). */
  @Column({ type: 'decimal', precision: 8, scale: 2, name: 'alto_mm', default: 297 })
  altoMm!: number;

  /** Diseno serializado (JSON) producido por el disenador visual. */
  @Column({ type: 'text', nullable: true })
  config?: string;

  /**
   * Imagen de fondo de referencia (hoja pre-impresa escaneada) para alinear
   * los campos en el disenador. No se imprime en el modo PRE_IMPRESO.
   */
  @Column({ nullable: true, type: 'text', name: 'background_image_url' })
  backgroundImageUrl?: string;

  @Column({ default: true })
  activo!: boolean;

  @Column({ default: false })
  predeterminada!: boolean;
}
