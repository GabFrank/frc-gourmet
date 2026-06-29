import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CanalNotificacion, EstadoEnvioNotificacion } from './notificaciones-enums';

/**
 * Auditoria de cada intento de envio + mecanismo de dedupe (claveDedupe unica)
 * para evitar reenviar el mismo mensaje (ej. cierre de caja procesado dos veces).
 */
@Entity('logs_notificacion')
export class LogNotificacion extends BaseModel {
  /** Codigo del evento que origino el envio (ej CAJA_CIERRE). */
  @Column({ name: 'evento_codigo' })
  eventoCodigo!: string;

  @Column({
    type: 'text',
    enum: CanalNotificacion,
  })
  canal!: CanalNotificacion;

  /** Destino concreto (email o numero/jid de whatsapp). */
  @Column({ nullable: true })
  destino?: string;

  /** Nombre del receptor para lectura rapida en la UI. */
  @Column({ nullable: true })
  destinoNombre?: string;

  @Column({
    type: 'text',
    enum: EstadoEnvioNotificacion,
  })
  estado!: EstadoEnvioNotificacion;

  /** Asunto (email) o primera linea — para listar. */
  @Column({ nullable: true })
  asunto?: string;

  @Column({ type: 'text', nullable: true })
  mensaje?: string;

  @Column({ type: 'text', nullable: true })
  error?: string;

  /** Id del mensaje devuelto por el proveedor (messageId SMTP / key.id Evolution). */
  @Column({ name: 'proveedor_message_id', nullable: true })
  proveedorMessageId?: string;

  @Column({ name: 'fecha_envio' })
  fechaEnvio!: Date;

  /** Clave de deduplicacion (unica). Si ya existe, no se reenvia. */
  @Index({ unique: true })
  @Column({ name: 'clave_dedupe', nullable: true })
  claveDedupe?: string;
}
