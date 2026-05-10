import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Refresh token persistente. El plain token vive solo en el cliente;
 * la BD guarda el sha256 (token_hash) y los metadatos para validacion.
 *
 * Endpoint /api/auth/refresh llega en F3 (server HTTP). En F0 alcanza
 * con la entity + util de generacion/rotacion para no romper el shape
 * de la BD cuando F3 se prenda.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseModel {
  @Index()
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Index()
  @Column({ name: 'token_hash', unique: true })
  tokenHash!: string;

  @Column({ name: 'issued_at' })
  issuedAt!: Date;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', nullable: true })
  revokedAt?: Date | null;

  @Column({ nullable: true })
  ip?: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;
}
