import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing the details of a money count
 */
@Entity('conteos_detalles')
export class ConteoDetalle extends BaseModel {
  @ManyToOne('Conteo', 'detalles', { nullable: false })
  @JoinColumn({ name: 'conteo_id' })
  conteo!: any;

  @ManyToOne('MonedaBillete', 'conteoDetalles', { nullable: false })
  @JoinColumn({ name: 'moneda_billete_id' })
  monedaBillete!: any;

  @Column('int')
  cantidad!: number;

  // Conteo resumido: total cargado directamente para la moneda (sin desglose por
  // denominación). Cuando está seteado, la fila lleva `cantidad = 0` y apunta a
  // cualquier billete de la moneda como portador; las agregaciones usan
  // COALESCE(monto, cantidad * valor). NULL en el conteo completo por billete.
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  monto?: number | null;

  @Column({ default: true })
  activo!: boolean;
}
