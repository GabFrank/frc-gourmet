import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CanalNotificacion } from './notificaciones-enums';
import { EventoNotificacion } from './evento-notificacion.entity';
import { ReceptorNotificacion } from './receptor-notificacion.entity';

/**
 * Ruteo: que receptor recibe que evento y por que canal. Un mismo receptor puede
 * estar suscripto a varios eventos, y por email y/o whatsapp.
 */
@Entity('suscripciones_notificacion')
@Index(['evento', 'receptor', 'canal'], { unique: true })
export class SuscripcionNotificacion extends BaseModel {
  @ManyToOne(() => EventoNotificacion)
  @JoinColumn({ name: 'evento_id' })
  evento!: EventoNotificacion;

  @ManyToOne(() => ReceptorNotificacion)
  @JoinColumn({ name: 'receptor_id' })
  receptor!: ReceptorNotificacion;

  @Column({
    type: 'text',
    enum: CanalNotificacion,
    default: CanalNotificacion.WHATSAPP,
  })
  canal!: CanalNotificacion;

  @Column({ default: true })
  activo!: boolean;
}
