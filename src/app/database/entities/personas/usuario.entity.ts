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

  /**
   * Hash bcrypt. `select: false` es una bandera de query (NO genera DDL, no
   * necesita migración): con ella la columna deja de venir en cualquier
   * `find`/`leftJoinAndSelect` que hidrate un `Usuario`, y con eso el hash
   * desaparece de las ~30 respuestas que arrastran `createdBy`.
   *
   * Los caminos que SÍ necesitan el hash lo piden explícito con
   * `.addSelect('<alias>.password')` (login IPC y HTTP, validate-credentials,
   * change-password, onboarding, seed del admin y migrate-passwords). Si
   * agregás un lector nuevo y te olvidás del `addSelect`, el valor llega
   * `undefined` — no falla ruidosamente, así que está cubierto por
   * `npm run test:sin-fuga-datos`.
   */
  @Column({ select: false })
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