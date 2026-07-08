import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { CuentaCliente } from './cuenta-cliente.entity';

/**
 * Refresh token de CLIENTE FINAL (storefront). Igual patrón que el de staff
 * (`RefreshToken`) pero atado a `CuentaCliente`: el plain vive en el cliente,
 * la BD guarda el sha256. Ver docs/arquitectura/webapp-pedidos-plan.md.
 */
@Entity('customer_refresh_tokens')
export class CustomerRefreshToken extends BaseModel {
  @Index()
  @ManyToOne(() => CuentaCliente, { onDelete: 'CASCADE', nullable: false, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cuenta_cliente_id' })
  cuentaCliente!: CuentaCliente;

  @Index()
  @Column({ name: 'token_hash', unique: true })
  tokenHash!: string;

  @Column({ name: 'issued_at' })
  issuedAt!: Date;

  @Column({ name: 'expires_at' })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', nullable: true })
  revokedAt?: Date;

  @Column({ nullable: true })
  ip?: string;

  @Column({ name: 'user_agent', nullable: true })
  userAgent?: string;
}
