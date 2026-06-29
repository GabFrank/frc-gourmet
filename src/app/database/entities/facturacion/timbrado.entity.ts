import { Column, Entity, OneToMany } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Timbrado: autorizacion de impresion/emision otorgada por la SET (Paraguay).
 * Controla la vigencia (fechaInicio/fechaFin para timbrados fisicos) y agrupa
 * a sus detalles (rangos por punto de expedicion).
 *
 * Para timbrados electronicos (isElectronico=true) las fechas pueden ir nulas:
 * la vigencia la administra SIFEN.
 */
@Entity('timbrados')
export class Timbrado extends BaseModel {
  /** Numero de timbrado otorgado por la SET. */
  @Column()
  numero!: string;

  /** Razon social del emisor (si difiere de la Empresa configurada). */
  @Column({ nullable: true, name: 'razon_social' })
  razonSocial?: string;

  @Column({ nullable: true })
  ruc?: string;

  /** true = timbrado electronico (SIFEN), false = fisico/pre-impreso. */
  @Column({ default: false, name: 'is_electronico' })
  isElectronico!: boolean;

  /** Codigo de Seguridad del Contribuyente (para QR en KuDE electronico). */
  @Column({ nullable: true })
  csc?: string;

  @Column({ nullable: true, name: 'csc_id' })
  cscId?: string;

  /** Inicio de vigencia (obligatorio en timbrados fisicos). */
  @Column({ type: 'date', nullable: true, name: 'fecha_inicio' })
  fechaInicio?: Date;

  /** Fin de vigencia (obligatorio en timbrados fisicos). */
  @Column({ type: 'date', nullable: true, name: 'fecha_fin' })
  fechaFin?: Date;

  /** Tipo de documento al que aplica el timbrado (FACTURA, NOTA_CREDITO, etc.). */
  @Column({ nullable: true, name: 'tipo_documento', default: 'FACTURA' })
  tipoDocumento?: string;

  @Column({ nullable: true, type: 'text' })
  observacion?: string;

  @Column({ default: true })
  activo!: boolean;

  @OneToMany('TimbradoDetalle', 'timbrado')
  detalles!: any[];
}
