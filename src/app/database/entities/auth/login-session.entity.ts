import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Usuario } from '../personas/usuario.entity';

/**
 * Entity representing a user login session
 */
@Entity('login_sessions')
export class LoginSession extends BaseModel {
  @ManyToOne(() => Usuario)
  @JoinColumn({ name: 'usuario_id' })
  usuario!: Usuario;

  @Column()
  ip_address!: string;

  @Column()
  user_agent!: string;

  @Column({ nullable: true })
  device_info?: string;

  @Column()
  login_time!: Date;

  @Column({ nullable: true })
  logout_time?: Date;

  @Column({ default: true })
  is_active!: boolean;

  @Column({ nullable: true })
  last_activity_time?: Date;

  @Column({ nullable: true })
  location?: string;

  @Column({ nullable: true })
  browser?: string;

  @Column({ nullable: true })
  os?: string;
} 