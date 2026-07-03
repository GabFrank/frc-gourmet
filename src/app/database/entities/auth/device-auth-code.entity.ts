import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Código de vinculación de dispositivo (QR login / Device Authorization Grant).
 *
 * Flujo: un dispositivo (TV KDS / desktop) pide un `deviceCode` y muestra su QR;
 * el usuario, ya logueado en el PWA, lo escanea y aprueba; el dispositivo
 * pollea y recibe sus tokens (queda logueado como el usuario que aprobó).
 *
 * El code es efímero (~3 min) y de un solo uso.
 */
@Entity('device_auth_codes')
export class DeviceAuthCode extends BaseModel {
  @Column({ name: 'device_code', unique: true })
  deviceCode!: string;

  /** PENDING | APPROVED | CONSUMED */
  @Column({ default: 'PENDING' })
  estado!: string;

  /** Usuario que aprobó (el dispositivo se loguea como él). */
  @Column({ name: 'usuario_id', type: 'int', nullable: true })
  usuarioId?: number | null;

  @Column({ name: 'device_info', type: 'text', nullable: true })
  deviceInfo?: string | null;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'approved_at', nullable: true })
  approvedAt?: Date | null;

  @Column({ name: 'consumed_at', nullable: true })
  consumedAt?: Date | null;
}
