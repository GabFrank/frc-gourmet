import { Column, Entity, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { Usuario } from '../personas/usuario.entity';
import { TipoNotificacionRrhh, PrioridadNotificacion } from './notificacion-rrhh-enums';

@Entity('notificaciones_rrhh')
export class NotificacionRrhh extends BaseModel {
  @Column({
    type: 'varchar',
    enum: TipoNotificacionRrhh,
  })
  tipo!: TipoNotificacionRrhh;

  @Column({
    type: 'varchar',
    enum: PrioridadNotificacion,
    default: PrioridadNotificacion.MEDIA,
  })
  prioridad!: PrioridadNotificacion;

  @Column({ type: 'varchar', length: 300 })
  titulo!: string;

  @Column({ type: 'text' })
  mensaje!: string;

  @ManyToOne(() => Funcionario, { nullable: true })
  @JoinColumn({ name: 'funcionario_id' })
  funcionario?: Funcionario;

  @ManyToOne(() => Usuario, { nullable: true })
  @JoinColumn({ name: 'usuario_destino_id' })
  usuarioDestino?: Usuario;

  @Column({ name: 'fecha_generada' })
  fechaGenerada!: Date;

  @Column({ name: 'fecha_leida', nullable: true })
  fechaLeida?: Date;

  @Column({ name: 'accion_url', nullable: true })
  accionUrl?: string;

  @Index({ unique: true })
  @Column({ name: 'clave_dedupe', nullable: true })
  claveDedupe?: string;
}
