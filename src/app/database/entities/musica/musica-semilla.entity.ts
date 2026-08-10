import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoSemilla } from './musica-enums';

/**
 * "Que suene como esto": la entrada principal de configuracion del modulo.
 *
 * El dueno no describe parametros (BPM, energia), describe ejemplos: pega
 * playlists que le gustan o marca artistas de referencia. De estas semillas
 * sale todo el repertorio (`MusicaTrack`) y de ahi se deducen los perfiles.
 *
 * Ver docs/DISENO-OPERATIVO-MUSICA.md seccion 1 y 2.
 */
@Entity('musica_semillas')
export class MusicaSemilla extends BaseModel {
  @Column({ type: 'text', enum: TipoSemilla })
  tipo!: TipoSemilla;

  /** URI de Spotify: spotify:playlist:xxx / spotify:artist:xxx. */
  @Index()
  @Column()
  spotifyUri!: string;

  /** Nombre legible (playlist o artista), en UPPERCASE. */
  @Column()
  nombre!: string;

  /** Imagen para que el dueno reconozca la semilla de un vistazo. */
  @Column({ nullable: true })
  imagenUrl?: string;

  /**
   * Bloques a los que aplica, por id, en JSON. Vacio = general (todos).
   * Permite "esta playlist es para el almuerzo".
   */
  @Column({ type: 'simple-json', nullable: true })
  bloqueIds?: number[];

  /** Cuantos tracks aporto la ultima importacion. */
  @Column({ type: 'int', default: 0 })
  tracksImportados!: number;

  @Column({ type: 'datetime', nullable: true })
  ultimaImportacion?: Date;

  @Column({ default: true })
  activo!: boolean;
}
