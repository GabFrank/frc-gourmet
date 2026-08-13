import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { EstadoTrack } from './musica-enums';
import { MusicaEstilo } from './musica-estilo.entity';

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

  /**
   * Genero CRUDO como lo devuelve Spotify en `/artists/{id}`. Se conserva tal
   * cual, sin normalizar: es el dato de origen y la entrada de la tabla de
   * alias. Para decidir que suena en cada bloque se usa `estilo`, no esto.
   *
   * Ojo: es genero de ARTISTA, no de tema. `MPB` cubre desde Gal Costa hasta
   * Marcelo D2, por eso solo no alcanza para clasificar.
   */
  @Column({ nullable: true })
  genero?: string;

  /* ─────────── Clasificacion por estilo ───────────
   *
   * Tres fuentes OPINAN y cada una escribe SOLO su columna; `estilo` es el
   * valor resuelto por precedencia (ver `resolverEstilo`) y es el unico que
   * lee el planner.
   *
   * Antes habia una sola columna y la ultima capa en correr pisaba a las
   * demas. Eso hacia imposible una distincion real del local: "bossa covers"
   * vs "bossa clasica" son el MISMO genero (`BOSSA NOVA`) y solo se distinguen
   * entendiendo el tema, asi que el agente acertaba y la reclasificacion por
   * genero lo revertia en la corrida siguiente, en silencio.
   *
   * Guardar las opiniones por separado tiene un segundo beneficio: donde el
   * agente y el genero DIFIEREN hay, casi siempre, una distincion que la
   * taxonomia de generos no sabe expresar. Esa lista es la cola de curacion y
   * se arma sola.
   */

  /** Valor resuelto = manual ?? agente ?? genero. Lo unico que lee el planner. */
  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estilo_id' })
  estilo?: MusicaEstilo | null;

  /** Correccion del dueno. Gana siempre: ninguna corrida automatica la pisa. */
  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estilo_manual_id' })
  estiloManual?: MusicaEstilo | null;

  /**
   * Veredicto del LLM. Va ARRIBA del genero porque es el unico que "entiende"
   * el tema: sabe que Nouvelle Vague es un proyecto de covers aunque su genero
   * declarado sea bossa nova.
   */
  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estilo_agente_id' })
  estiloAgente?: MusicaEstilo | null;

  /** Derivado del genero crudo via tabla de alias, o heredado del artista. */
  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estilo_genero_id' })
  estiloGenero?: MusicaEstilo | null;

  /**
   * @deprecated Reemplazado por `estiloManual` (fijado = tiene manual). Se
   * conserva por la regla de migraciones aditivas; se sigue escribiendo para
   * que un rollback a la version anterior no pierda la curacion manual.
   */
  @Column({ default: false })
  estiloFijado!: boolean;

  // ─────────── Etiquetado semantico (LLM, una sola vez) ───────────

  /** Momentos donde encaja. Vocabulario cerrado: ver `EscenaTrack`. */
  @Column({ type: 'simple-json', nullable: true })
  escenas?: string[];

  /**
   * Como se siente el tema. Vocabulario cerrado: ver `AnimoTrack`.
   *
   * Es lo que hace cumplir "nada triste" del brief: la valencia de ReccoBeats
   * cubre el 87% del repertorio y no distingue una balada linda de una de
   * despecho, mientras que esta columna esta al 100% y la escribe quien
   * entiende la letra.
   */
  @Index()
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
