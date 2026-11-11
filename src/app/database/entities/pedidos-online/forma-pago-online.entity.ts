import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Una CUENTA de un proveedor de pago online (PLAN-tienda-pagos-multi-icpay): puede haber varias,
 * incluso del mismo proveedor. El cliente elige entre las activas en el checkout, en `orden`.
 *
 * - `proveedor` = id del módulo (`BANCARD`, `ICPAY`, …) = `pedidos_online.metodo_pago`.
 * - `configJson`: datos NO secretos del proveedor (`{"baseUrl":…,"email":…}`). Los secretos van al
 *   almacén seguro por cuenta. `_legado: '1'` = la convirtió la migración: sus secretos son los de
 *   antes (una sola cuenta por proveedor).
 */
@Entity('formas_pago_online')
export class FormaPagoOnline extends BaseModel {
  @Column({ type: 'varchar', length: 20 })
  proveedor!: string;

  /** Lo que ve el cliente en el checkout (UPPERCASE). */
  @Column({ type: 'varchar', length: 80 })
  nombre!: string;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ name: 'permite_pickup', type: 'boolean', default: true })
  permitePickup!: boolean;

  @Column({ name: 'permite_delivery', type: 'boolean', default: true })
  permiteDelivery!: boolean;

  @Column({ name: 'config_json', type: 'text', nullable: true })
  configJson?: string | null;

  /**
   * Máquina POS donde se acredita lo cobrado por esta cuenta (su cuenta bancaria, moneda, comisión y
   * plazo). Sin máquina, el cobro online no se acredita en Bancos.
   */
  @Column({ name: 'maquina_pos_id', type: 'int', nullable: true })
  maquinaPosId?: number | null;
}
