import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Configuración de la tienda online (una sola fila). Controla qué ve y puede
 * hacer el cliente en el storefront: apertura, tipos de pedido, prep-time,
 * mínimo de pedido, aceptación automática y branding.
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
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

  /** Habilita el canal de pedidos en mesa por QR (MESA_QR autoservicio). */
  @Column({ name: 'permite_mesa', type: 'boolean', default: false })
  permiteMesa!: boolean;

  /**
   * Exige que el pedido MESA_QR provenga de la red del local. El alpha está
   * expuesto a internet (app.frc-gourmet.com), así que se valida el IP de origen
   * del request contra `rangoLanMesa`. Solo aplica al canal QR_MESA.
   */
  @Column({ name: 'requiere_lan_mesa', type: 'boolean', default: true })
  requiereLanMesa!: boolean;

  /**
   * Rangos LAN permitidos para MESA_QR, como CIDRs separados por coma
   * (ej. "192.168.0.0/16,10.0.0.0/8"). null = solo los rangos privados por defecto.
   */
  @Column({ name: 'rango_lan_mesa', type: 'varchar', length: 255, nullable: true })
  rangoLanMesa?: string;

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
