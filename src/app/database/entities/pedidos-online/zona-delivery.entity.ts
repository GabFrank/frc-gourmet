import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Zona de delivery para pedidos online: tarifa fija + monto mínimo de pedido.
 *
 * Fase 3 (básico: tarifa plana por zona). Fase 6 agrega polígono/drive-time y
 * auto-asignación fina por dirección. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
@Entity('zonas_delivery')
export class ZonaDelivery extends BaseModel {
  @Column({ type: 'varchar', length: 150 })
  nombre!: string;

  @Column({ type: 'decimal', precision: 18, scale: 2, default: 0 })
  tarifa!: number;

  @Column({ name: 'monto_minimo', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoMinimo!: number;

  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  /** Orden de despliegue en la web. */
  @Column({ type: 'int', default: 0 })
  orden!: number;
}
