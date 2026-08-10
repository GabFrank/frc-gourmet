import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { OrigenPlan } from './musica-enums';

/**
 * El plan de un dia: se resuelve UNA vez (de madrugada, o cuando el usuario
 * pide regenerar) y queda materializado en playlists de Spotify.
 *
 * No hay un loop eligiendo tema por tema: el dia entero esta decidido antes de
 * sonar. Eso lo hace auditable, barato en llamadas a la API, y sobre todo hace
 * que la musica siga sonando aunque FRC Gourmet se cierre.
 */
@Entity('musica_planes')
export class PlanProgramacion extends BaseModel {
  @Index({ unique: true })
  @Column({ type: 'date' })
  fecha!: string;

  @Column({ type: 'text', enum: OrigenPlan, default: OrigenPlan.REGLAS })
  origen!: OrigenPlan;

  /**
   * Por que el plan quedo asi, en lenguaje natural. Se muestra en pantalla
   * ("por que suena esto hoy") y queda auditado: si el dueno no esta de
   * acuerdo, corrige ahi mismo.
   */
  @Column({ type: 'text', nullable: true })
  justificacion?: string;

  /**
   * Instruccion puntual del usuario al regenerar ("hoy hay muchas familias con
   * chicos"). Queda guardada junto al plan que produjo.
   */
  @Column({ type: 'text', nullable: true })
  instruccion?: string;

  @Column({ default: true })
  activo!: boolean;
}
