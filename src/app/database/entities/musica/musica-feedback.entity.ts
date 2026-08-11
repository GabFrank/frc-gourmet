import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoFeedback } from './musica-enums';

/**
 * Los dos botones: "No va" y "Mas de esto".
 *
 * Es lo que hace que el sistema mejore solo: el dueno no vuelve a configurar
 * nada, solo reacciona cuando algo molesta. Tres "No va" al mismo artista en la
 * misma franja generan un veto automatico para esa franja.
 *
 * Solo cajeros, gerentes y admin pueden votar (permiso MUSICA_CONTROLAR); los
 * mozos ven que suena pero no intervienen.
 */
@Entity('musica_feedback')
export class MusicaFeedback extends BaseModel {
  @Index()
  @Column()
  spotifyId!: string;

  @Column({ nullable: true })
  artistaId?: string;

  @Column({ nullable: true })
  titulo?: string;

  @Column({ type: 'text', enum: TipoFeedback })
  tipo!: TipoFeedback;

  @Index()
  @Column({ type: 'int', nullable: true })
  bloqueId?: number;

  @Column()
  fecha!: Date;
}
