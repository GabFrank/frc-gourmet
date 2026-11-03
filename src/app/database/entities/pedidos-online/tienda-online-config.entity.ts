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

  /**
   * Ingreso de clientes (PLAN-tienda-online F3). Solo datos NO secretos: el token de
   * WhatsApp Cloud va al almacén seguro del SO (`tienda-secrets.util.ts`), nunca a la BD.
   * Vacíos = se usan las variables de entorno (WHATSAPP_PHONE_NUMBER_ID, GOOGLE_CLIENT_ID...).
   */
  @Column({ name: 'whatsapp_phone_number_id', type: 'varchar', length: 64, nullable: true })
  whatsappPhoneNumberId?: string;

  @Column({ name: 'whatsapp_plantilla', type: 'varchar', length: 120, nullable: true })
  whatsappPlantilla?: string;

  @Column({ name: 'whatsapp_idioma', type: 'varchar', length: 16, nullable: true })
  whatsappIdioma?: string;

  /** Client ID OAuth web de Google (público). */
  @Column({ name: 'google_client_id', type: 'varchar', length: 255, nullable: true })
  googleClientId?: string;

  // ── Pago online con uPay (PLAN-tienda-online F4). La API Key va al almacén seguro. ──
  /** Ofrecer «Pagar con tarjeta» en pedidos NUEVOS. Apagarlo no corta la confirmación de los en curso. */
  @Column({ name: 'pago_online_activo', type: 'boolean', default: false })
  pagoOnlineActivo!: boolean;

  @Column({ name: 'upay_base_url', type: 'varchar', length: 255, nullable: true })
  upayBaseUrl?: string | null;

  @Column({ name: 'upay_merchant_id', type: 'varchar', length: 64, nullable: true })
  upayMerchantId?: string | null;

  @Column({ name: 'upay_merchant_nombre', type: 'varchar', length: 150, nullable: true })
  upayMerchantNombre?: string | null;

  /** Aviso al personal si un pedido pagado no se acepta en estos minutos. */
  @Column({ name: 'minutos_aviso_pagado_sin_aceptar', type: 'int', default: 20 })
  minutosAvisoPagadoSinAceptar!: number;
}
