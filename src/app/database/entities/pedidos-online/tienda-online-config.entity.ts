import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Configuración de la tienda online (una sola fila). Controla qué ve y puede
 * hacer el cliente en el storefront: apertura, tipos de pedido, prep-time,
 * mínimo de pedido, aceptación automática y branding.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 2 — config de tienda).
 */
@Entity('tienda_online_config')
export class TiendaOnlineConfig extends BaseModel {
  /** Interruptor maestro: si false, la tienda no toma pedidos. */
  @Column({ type: 'boolean', default: true })
  activa!: boolean;

  @Column({ name: 'nombre_comercio', type: 'varchar', length: 150, nullable: true })
  nombreComercio?: string;

  @Column({ name: 'mensaje_bienvenida', type: 'varchar', length: 300, nullable: true })
  mensajeBienvenida?: string;

  /** Color de marca (hex) para el tema del storefront. */
  @Column({ name: 'color_primario', type: 'varchar', length: 20, nullable: true })
  colorPrimario?: string;

  @Column({ name: 'permite_pickup', type: 'boolean', default: true })
  permitePickup!: boolean;

  @Column({ name: 'permite_delivery', type: 'boolean', default: true })
  permiteDelivery!: boolean;

  /** Tiempo estimado de preparación en minutos (se muestra al cliente). */
  @Column({ name: 'prep_time_minutos', type: 'int', default: 30 })
  prepTimeMinutos!: number;

  @Column({ name: 'monto_minimo_pedido', type: 'decimal', precision: 18, scale: 2, default: 0 })
  montoMinimoPedido!: number;

  /** Si true, los pedidos entran ACEPTADO directo (sin revisión manual). */
  @Column({ name: 'aceptacion_automatica', type: 'boolean', default: false })
  aceptacionAutomatica!: boolean;

  /**
   * Horarios de atención como JSON:
   * `[{ dia: 0-6 (0=Dom), abre: 'HH:mm', cierra: 'HH:mm', activo: bool }]`.
   * null/[] = siempre abierta (mientras `activa`).
   */
  @Column({ name: 'horarios_json', type: 'text', nullable: true })
  horariosJson?: string;
}
