import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Entity representing a system user
 */
@Entity('usuarios')
export class Usuario extends BaseModel {
  @ManyToOne('Persona')
  @JoinColumn({ name: 'persona_id' })
  persona!: any;

  @Column({ unique: true })
  nickname!: string;

  @Column()
  password!: string;

  @Column({ default: true })
  activo!: boolean;

  /**
   * P0-3: cuando es true, el frontend abre un dialog bloqueante post-login
   * que obliga a cambiar la password antes de cargar el dashboard. Se
   * setea en true para el admin seedeado (admin/admin) y se vuelve false
   * cuando el usuario completa el cambio.
   */
  @Column({ name: 'must_change_password', default: false })
  mustChangePassword!: boolean;
} 