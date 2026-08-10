import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { VarianteEnergia } from './musica-enums';

/**
 * Que sono, cuando, y como estaba el salon en ese momento.
 *
 * Sirve para tres cosas: la ventana anti-repeticion, el dashboard musica vs
 * ventas por bloque, y como insumo del planificador (que se repitio mucho,
 * que se salteo).
 */
@Entity('musica_track_log')
export class TrackLog extends BaseModel {
  @Index()
  @Column()
  spotifyId!: string;

  @Column({ nullable: true })
  titulo?: string;

  @Column({ nullable: true })
  artista?: string;

  @Index()
  @Column({ type: 'int', nullable: true })
  bloqueId?: number;

  @Column({ type: 'text', enum: VarianteEnergia, nullable: true })
  variante?: VarianteEnergia;

  @Index()
  @Column({ type: 'datetime' })
  inicio!: Date;

  @Column({ type: 'datetime', nullable: true })
  fin?: Date;

  /** True si se salteo (por "no va" o por quedar fuera de perfil). */
  @Column({ default: false })
  salteado!: boolean;

  /** Estado del salon al momento de sonar (datos del PdV). */
  @Column({ type: 'float', nullable: true })
  ocupacionPct?: number;

  @Column({ type: 'float', nullable: true })
  ventasPorMinuto?: number;
}
