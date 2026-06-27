import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CanalEvento } from './notificaciones-enums';

/**
 * Catalogo de eventos que pueden disparar una notificacion (CAJA_CIERRE,
 * PEDIDO_CANCELADO, CUMPLEANIOS, PASSWORD_RESET, etc). El administrador puede
 * activar/desactivar cada evento de forma independiente (on/off por funcion).
 *
 * Se seedea idempotente al startup; nuevos eventos se agregan al seed.
 */
@Entity('eventos_notificacion')
export class EventoNotificacion extends BaseModel {
  /** Codigo estable usado en el codigo fuente para disparar el evento. */
  @Index({ unique: true })
  @Column()
  codigo!: string;

  /** Nombre legible para la UI. */
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  descripcion?: string;

  /** Canales por los que este evento puede enviarse. */
  @Column({
    type: 'text',
    enum: CanalEvento,
    default: CanalEvento.AMBOS,
  })
  canal!: CanalEvento;

  /** on/off por funcion. Si esta en false, el evento no envia nada. */
  @Column({ default: true })
  activo!: boolean;
}
