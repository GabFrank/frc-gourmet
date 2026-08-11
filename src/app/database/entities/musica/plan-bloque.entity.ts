import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { PlanProgramacion } from './plan-programacion.entity';
import { BloqueProgramacion } from './bloque-programacion.entity';
import { VarianteEnergia } from './musica-enums';

/**
 * Una playlist REAL de Spotify: la materializacion de un bloque del plan en una
 * de sus tres variantes de energia.
 *
 * Las playlists son fijas y se sobreescriben cada dia (mismo `spotifyPlaylistId`,
 * items nuevos): no ensucian la cuenta y el dueno puede abrirlas en su Spotify,
 * mirarlas y hasta editarlas a mano.
 *
 * Se generan ~1,5x mas largas que el bloque: si una playlist se terminara,
 * Spotify arrancaria su autoplay de recomendaciones, que es justo lo que el
 * sistema existe para evitar.
 */
@Entity('musica_plan_bloques')
export class PlanBloque extends BaseModel {
  @Index()
  @ManyToOne(() => PlanProgramacion, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: PlanProgramacion;

  @ManyToOne(() => BloqueProgramacion, { nullable: false })
  @JoinColumn({ name: 'bloque_id' })
  bloque!: BloqueProgramacion;

  @Column({ type: 'text', enum: VarianteEnergia, default: VarianteEnergia.NORMAL })
  variante!: VarianteEnergia;

  /** Playlist reutilizada entre dias; null hasta la primera materializacion. */
  @Column({ nullable: true })
  spotifyPlaylistId?: string;

  /** URI para `play(context_uri)`. */
  @Column({ nullable: true })
  spotifyUri?: string;

  /** Ids de tracks en orden, como se escribieron en la playlist. */
  @Column({ type: 'simple-json', nullable: true })
  trackIds?: string[];

  @Column({ type: 'int', default: 0 })
  cantidadTracks!: number;

  @Column({ type: 'int', default: 0 })
  duracionMs!: number;

  @Column({ nullable: true })
  materializadoAt?: Date;
}
