import { Column, Entity, Index, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Cliente } from '../personas/cliente.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Cuenta de CLIENTE FINAL de la web de pedidos online (auth autoservicio).
 *
 * Separada de `Usuario` (staff). El login primario es por **teléfono + OTP**
 * (WhatsApp); opcionalmente el cliente define email + password. Puede vincularse
 * a un `Cliente` interno para historial/crédito/facturación, pero no lo exige.
 *
 * Ver .claude/skills/frc-gourmet-expert/domains/pedidos-online.md.
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

  /**
   * Teléfono de CONTACTO (solo dígitos), sin verificar: lo carga el cliente en el checkout o en
   * su cuenta cuando no ingresó por teléfono (Google, email). El local lo usa para llamarlo o
   * escribirle por el pedido. **No sirve para ingresar** — eso es `telefono`, único y verificado.
   */
  @Column({ name: 'telefono_contacto', type: 'varchar', length: 30, nullable: true })
  telefonoContacto?: string | null;

  /**
   * Avisos del pedido por WhatsApp. NULL: no eligió (manda la casilla del checkout). TRUE/FALSE:
   * lo eligió en «Mi cuenta» o en el último checkout, y vale también para los pedidos en curso.
   */
  @Column({ name: 'avisos_whatsapp', type: 'boolean', nullable: true })
  avisosWhatsapp?: boolean | null;

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

  /**
   * Vínculo opcional al Cliente interno (historial, crédito, facturación). Lo hace el personal a
   * mano (F8b), nunca automático por teléfono o correo. Único: un cliente, una cuenta web.
   */
  @ManyToOne(() => Cliente, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'cliente_id' })
  cliente?: Cliente | null;

  /** Quién hizo el vínculo vigente (el historial completo está en `cuentas_cliente_vinculos`). */
  @ManyToOne(() => Usuario, { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'vinculado_por' })
  vinculadoPor?: Usuario | null;

  @Column({ name: 'vinculado_en', nullable: true })
  vinculadoEn?: Date;

  @Column({ type: 'boolean', default: true })
  activo!: boolean;

  @Column({ name: 'ultimo_login', nullable: true })
  ultimoLogin?: Date;
}
