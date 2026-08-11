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

  /**
   * Estilo canonico del local. Se RESUELVE Y PERSISTE al importar/etiquetar en
   * vez de calcularse por string en cada consulta: el planner necesita filtrar
   * cientos de temas por cuota y hacerlo con LIKE sobre texto libre seria caro
   * y fragil.
   *
   * `null` = sin clasificar. La pantalla de estilos los muestra aparte para que
   * no se acumulen en silencio, que es como se pudren estas taxonomias.
   */
  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'estilo_id' })
  estilo?: MusicaEstilo | null;

  /**
   * El dueno corrigio el estilo a mano: la reclasificacion automatica no lo
   * pisa. Sin esto, cada vez que se recalcula el catalogo se perderia toda la
   * curacion manual, y nadie corrige dos veces lo mismo.
   */
  @Column({ default: false })
  estiloFijado!: boolean;

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
