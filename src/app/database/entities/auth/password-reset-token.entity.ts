import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';
import { CanalNotificacion } from '../notificaciones/notificaciones-enums';

/**
 * Token de recuperacion/cambio de contrasenha. Se envia un CODIGO al usuario
 * (por email o whatsapp); aca guardamos solo el HASH del codigo (bcrypt), nunca
 * el codigo en claro. Es de un solo uso y expira.
 */
@Entity('password_reset_tokens')
export class PasswordResetToken extends BaseModel {
  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  /** Hash bcrypt del codigo enviado. */
  @Column({ name: 'token_hash' })
  tokenHash!: string;

  /** Canal por el que se envio el codigo. */
  @Column({
    type: 'text',
    enum: CanalNotificacion,
  })
  canal!: CanalNotificacion;

  /** Destino al que se envio (email o numero), enmascarado al mostrar. */
  @Column({ nullable: true })
  destino?: string;

  @Column({ name: 'expira_en' })
  expiraEn!: Date;

  /** Cantidad de intentos fallidos de validacion del codigo. */
  @Column({ name: 'intentos', default: 0 })
  intentos!: number;

  @Column({ default: false })
  usado!: boolean;

  @Index()
  @Column({ default: true })
  activo!: boolean;
}
