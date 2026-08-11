import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { EstadoTrack } from './musica-enums';

/**
 * El repertorio del local: indice PROPIO de tracks con sus caracteristicas.
 *
 * Existe porque Spotify apago `audio-features`, `audio-analysis`,
 * `recommendations` y `related-artists` para apps nuevas (nov-2024). Las
 * caracteristicas se traen de ReccoBeats y el etiquetado semantico del LLM, y
 * se cachean aca UNA vez por track, para siempre.
 *
 * Este indice es el activo del producto: sobrevive a un cambio de proveedor de
 * musica, mientras que las playlists de Spotify no.
 */
@Entity('musica_tracks')
export class MusicaTrack extends BaseModel {
  @Index({ unique: true })
  @Column()
  spotifyId!: string;

  /** Identificador universal de grabacion: sirve para deduplicar entre fuentes. */
  @Index()
  @Column({ nullable: true })
  isrc?: string;

  @Column()
  titulo!: string;

  @Column()
  artista!: string;

  /** Id del artista principal en Spotify: permite vetar por artista. */
  @Index()
  @Column({ nullable: true })
  artistaId?: string;

  @Column({ nullable: true })
  album?: string;

  @Column({ nullable: true })
  imagenUrl?: string;

  @Column({ type: 'int', default: 0 })
  duracionMs!: number;

  @Column({ default: false })
  explicit!: boolean;

  // ─────────── Caracteristicas de audio (ReccoBeats) ───────────

  @Column({ type: 'float', nullable: true })
  bpm?: number;

  /** 0..1 */
  @Column({ type: 'float', nullable: true })
  energia?: number;

  /**
   * 0..1 — que tan "alegre" suena. Es la columna que implementa la regla
   * transversal "nada triste" del local.
   */
  @Column({ type: 'float', nullable: true })
  valencia?: number;

  @Column({ type: 'float', nullable: true })
  danceability?: number;

  @Column({ nullable: true })
  genero?: string;

  // ─────────── Etiquetado semantico (LLM, una sola vez) ───────────

  /** Momentos donde encaja: ['almuerzo', 'cena', 'sunset']. */
  @Column({ type: 'simple-json', nullable: true })
  escenas?: string[];

  /** 'relajado' | 'alegre' | 'energico' | ... */
  @Column({ nullable: true })
  ambiente?: string;

  /** 'conocida' | 'descubrimiento' — para dosificar hits vs fondo. */
  @Column({ nullable: true })
  familiaridad?: string;

  /**
   * El filtro `explicit` de Spotify no marca letras vulgares que no dicen
   * malas palabras. Esta columna la completa el LLM y es la que realmente
   * protege el ambiente familiar del local.
   */
  @Column({ nullable: true })
  aptoFamiliar?: boolean;

  @Column({ nullable: true })
  idioma?: string;

  @Column({ default: false })
  etiquetado!: boolean;

  // ─────────── Estado y uso ───────────

  @Column({ type: 'text', enum: EstadoTrack, default: EstadoTrack.SUGERIDO })
  estado!: EstadoTrack;

  /** Sube con "mas de esto", baja con "no va". Ordena la seleccion. */
  @Column({ type: 'float', default: 0 })
  score!: number;

  /** Ultima vez que sono: alimenta la ventana anti-repeticion. */
  @Index()
  @Column({ nullable: true })
  ultimaVez?: Date;

  @Column({ type: 'int', default: 0 })
  vecesSonado!: number;
}
