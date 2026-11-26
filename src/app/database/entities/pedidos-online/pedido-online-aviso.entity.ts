import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/** Aviso del pedido al cliente por WhatsApp (cola con reintentos, PLAN-tienda-avisos-whatsapp). */
@Entity('pedido_online_avisos')
@Index('UQ_pedido_online_avisos_pedido_evento', ['pedidoOnlineId', 'evento'], { unique: true })
export class PedidoOnlineAviso extends BaseModel {
  @Column({ name: 'pedido_online_id', type: 'integer' })
  pedidoOnlineId!: number;

  /** ACEPTADO / LISTO / EN_CAMINO / ENTREGADO / CANCELADO. */
  @Column({ type: 'varchar', length: 20 })
  evento!: string;

  @Column({ type: 'varchar', length: 30 })
  telefono!: string;

  /** PENDIENTE / ENVIANDO / ENVIADO / FALLIDO / DESCARTADO. */
  @Column({ type: 'varchar', length: 15, default: 'PENDIENTE' })
  estado!: string;

  @Column({ type: 'integer', default: 0 })
  intentos!: number;

  @Column({ name: 'proximo_intento', nullable: true })
  proximoIntento?: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  error?: string | null;

  @Column({ name: 'enviado_en', nullable: true })
  enviadoEn?: Date;
}
