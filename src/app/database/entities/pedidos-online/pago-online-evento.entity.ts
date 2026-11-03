import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Registro de cada llamada al proveedor de pago online (PLAN-tienda-online F4): crear sesión,
 * consultar sesión/pago, resultado. Para auditar por qué un pedido quedó pagado o no.
 * `respuesta` va sin la API Key (nunca viaja en el cuerpo) y recortada.
 */
@Entity('pagos_online_eventos')
export class PagoOnlineEvento extends BaseModel {
  @Index()
  @Column({ name: 'pedido_online_id', type: 'int' })
  pedidoOnlineId!: number;

  @Column({ type: 'int', nullable: true })
  intento?: number | null;

  /** SESION_CREADA, CONSULTA, PAGADO, FALLIDO, EXPIRADO, REEMBOLSO, ERROR… */
  @Column({ type: 'varchar', length: 30 })
  tipo!: string;

  @Column({ name: 'estado_proveedor', type: 'varchar', length: 60, nullable: true })
  estadoProveedor?: string | null;

  @Column({ type: 'text', nullable: true })
  respuesta?: string | null;
}
