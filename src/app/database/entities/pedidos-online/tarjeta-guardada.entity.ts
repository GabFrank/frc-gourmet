import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Tarjeta que un cliente de la tienda guardó en dinelco (catastro) para pagar con un toque
 * (PLAN-tienda-tarjeta-guardada). Nunca hay número completo, vencimiento ni CVV: dinelco los
 * guarda y nos da un `tokenId` que solo sirve con NUESTRA clave. Tampoco se guarda el `token`.
 *
 * Una fila nace PENDIENTE al abrir el catastro (`registro_ref`) y pasa a ACTIVA solo si dinelco
 * confirma el catastro; FALLIDA si no; QUITADA cuando el cliente la quita (no se borra).
 */
@Entity('tienda_tarjetas_guardadas')
@Index('UQ_tienda_tarjetas_registro_ref', ['registroRef'], { unique: true })
export class TarjetaGuardada extends BaseModel {
  @Index('IDX_tienda_tarjetas_cuenta')
  @Column({ name: 'cuenta_cliente_id', type: 'integer' })
  cuentaClienteId!: number;

  /** La cuenta DINELCO (`formas_pago_online`) que la catastró: el token vale solo para ese comercio. */
  @Column({ name: 'forma_pago_online_id', type: 'integer', nullable: true })
  formaPagoOnlineId?: number | null;

  @Column({ name: 'registro_ref', type: 'varchar', length: 60 })
  registroRef!: string;

  /** Sesión de catastro de dinelco (para consultarla). */
  @Column({ name: 'registro_sesion_id', type: 'varchar', length: 30, nullable: true })
  registroSesionId?: string | null;

  /** PENDIENTE / ACTIVA / FALLIDA / QUITADA. */
  @Column({ type: 'varchar', length: 12, default: 'PENDIENTE' })
  estado!: string;

  @Column({ name: 'token_id', type: 'varchar', length: 80, nullable: true, select: false })
  tokenId?: string | null;

  /** VSA / MST / DIN. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  marca?: string | null;

  /** bin****last4, tal como lo devuelve dinelco. */
  @Column({ type: 'varchar', length: 30, nullable: true })
  enmascarada?: string | null;

  /** C crédito / D débito / A afiliada. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  tipo?: string | null;

  /** El cliente marcó «Guardar esta tarjeta» (consentimiento). */
  @Column({ name: 'consentimiento_en', nullable: true })
  consentimientoEn?: Date;

  @Column({ name: 'ultimo_uso_en', nullable: true })
  ultimoUsoEn?: Date;

  @Column({ name: 'quitada_en', nullable: true })
  quitadaEn?: Date;

  /** Por qué falló el catastro (mensaje de dinelco), para el cliente y para auditar. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  detalle?: string | null;
}
