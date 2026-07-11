import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';

/**
 * Cuenta de CLIENTE FINAL de la web de pedidos online (auth autoservicio).
 *
 * Separada de `Usuario` (staff). El login primario es por **teléfono + OTP**
 * (WhatsApp); opcionalmente el cliente define email + password. Puede vincularse
 * a un `Cliente` interno para historial/crédito/facturación, pero no lo exige.
 *
 * Ver docs/arquitectura/webapp-pedidos-plan.md (Fase 2).
 */
@Entity('cuentas_cliente')
export class CuentaCliente extends BaseModel {
  /**
   * Teléfono normalizado (solo dígitos, con código de país). Login por OTP.
   * Nullable desde Fase C: las cuentas por email/Google pueden no tener teléfono.
   */
  @Index({ unique: true })
  @Column({ length: 30, nullable: true })
  telefono?: string;

  @Column({ name: 'telefono_verificado', type: 'boolean', default: false })
  telefonoVerificado!: boolean;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email?: string;

  @Column({ name: 'email_verificado', type: 'boolean', default: false })
  emailVerificado!: boolean;

  /** Hash de password (bcrypt) — opcional: el cliente puede usar solo OTP. */
  @Column({ name: 'password_hash', type: 'varchar', length: 100, nullable: true })
  passwordHash?: string;

  /** Nombre para mostrar (UPPERCASE en BD). */
  @Column({ type: 'varchar', length: 150, nullable: true })
  nombre?: string;

  /** Vínculo opcional al Cliente interno (historial, crédito, facturación). */
  @ManyToOne(() => Cliente, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ name: 'ultimo_login', nullable: true })
  ultimoLogin?: Date;
}
