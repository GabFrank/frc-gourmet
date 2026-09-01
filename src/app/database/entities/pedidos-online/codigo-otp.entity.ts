import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Código OTP de un solo uso para verificar el teléfono de una `CuentaCliente`
 * (login/registro por WhatsApp). Se guarda el **hash** del código, nunca el
 * valor plano. Expira e invalida por intentos.
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
 */
@Entity('codigos_otp')
export class CodigoOtp extends BaseModel {
  @Index()
  @Column({ length: 30 })
  telefono!: string;

  /** Hash (bcrypt) del código OTP — no se persiste el valor plano. */
  @Column({ name: 'codigo_hash', length: 100 })
  codigoHash!: string;

  /** Canal por el que se envió: WHATSAPP | SMS. */
  @Column({ length: 20, default: 'WHATSAPP' })
  canal!: string;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ type: 'boolean', default: false })
  usado!: boolean;
}
