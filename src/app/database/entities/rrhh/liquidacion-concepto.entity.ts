import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Catalogo de conceptos de liquidacion. Codigo UPPERCASE unico.
 * Ej: SALARIO_BASE, IPS_DESCUENTO, ADELANTO_DESCUENTO, VALE_DESCUENTO,
 *     HORA_EXTRA, PENALIZACION, BONO_MANUAL, AGUINALDO, COMISION,
 *     PRESTAMO_CUOTA.
 */
@Entity('liquidacion_conceptos')
export class LiquidacionConcepto extends BaseModel {
  @Index({ unique: true })
  @Column()
  codigo!: string;

  @Column()
  descripcion!: string;

  @Column({ name: 'es_haber', default: true })
  esHaber!: boolean;

  @Column({ name: 'es_calculado_auto', default: false })
  esCalculadoAuto!: boolean;

  @Column({ default: true })
  activo!: boolean;
}
