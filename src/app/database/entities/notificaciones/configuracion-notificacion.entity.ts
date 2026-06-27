import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { ConfiguracionNotificacionTipo } from './notificaciones-enums';

/**
 * Configuracion key/value del modulo de Notificaciones (SMTP host/port/user/from,
 * URL/instancia de Evolution API, toggle global on/off, etc).
 *
 * IMPORTANTE: los SECRETOS (password SMTP, apikey de Evolution) NO se guardan aca
 * (texto plano). Se persisten en el almacen seguro del SO via keytar
 * (ver electron/utils/notificaciones-secrets.util.ts).
 */
@Entity('configuraciones_notificacion')
export class ConfiguracionNotificacion extends BaseModel {
  @Index({ unique: true })
  @Column()
  clave!: string;

  @Column({ nullable: true })
  valor?: string;

  @Column({
    type: 'text',
    enum: ConfiguracionNotificacionTipo,
    default: ConfiguracionNotificacionTipo.STRING,
  })
  tipo!: ConfiguracionNotificacionTipo;

  @Column({ nullable: true })
  descripcion?: string;

  @Column({ default: true })
  activo!: boolean;
}
