import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoReceptor } from './notificaciones-enums';
import { Persona } from '../personas/persona.entity';

/**
 * Receptor de notificaciones: una persona del sistema, un email crudo, un numero
 * de WhatsApp o un grupo de WhatsApp. El administrador puede agregar/quitar
 * receptores y suscribirlos a eventos via SuscripcionNotificacion.
 */
@Entity('receptores_notificacion')
export class ReceptorNotificacion extends BaseModel {
  @Column({
    type: 'text',
    enum: TipoReceptor,
    default: TipoReceptor.EMAIL,
  })
  tipo!: TipoReceptor;

  /** Nombre legible (ej "GRUPO COLABORADORES", "JUAN PEREZ"). */
  @Column()
  nombre!: string;

  /**
   * Valor del destino segun tipo:
   * - EMAIL: direccion de email
   * - NUMERO: numero WhatsApp internacional (ej 595991123456)
   * - GRUPO_WHATSAPP: JID del grupo (ej 120363...@g.us)
   * - PERSONA: vacio (se resuelve desde la persona vinculada)
   */
  @Column({ nullable: true })
  valor?: string;

  /** Solo para tipo PERSONA: persona de la que se toman email/telefono. */
  @ManyToOne(() => Persona, { nullable: true })
  @JoinColumn({ name: 'persona_id' })
  persona?: Persona;

  @Column({ default: true })
  activo!: boolean;
}
