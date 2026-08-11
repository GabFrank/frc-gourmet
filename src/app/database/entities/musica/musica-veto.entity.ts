import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';
import { TipoVeto } from './musica-enums';

/**
 * Lo que NO puede sonar. Es mas facil de expresar para el dueno que lo que si,
 * y es lo que protege la marca del local.
 *
 * Un veto puede ser global (bloqueId null) o acotado a un bloque: "reggaeton
 * nunca", pero tambien "pagode si, aunque no en el almuerzo de semana".
 *
 * Se generan a mano desde la configuracion, o automaticamente cuando el staff
 * marca "No va" 3 veces al mismo artista en la misma franja.
 */
@Entity('musica_vetos')
export class MusicaVeto extends BaseModel {
  @Column({ type: 'text', enum: TipoVeto })
  tipo!: TipoVeto;

  /** Id de Spotify (artista/track) o texto del genero/idioma, en UPPERCASE. */
  @Index()
  @Column()
  valor!: string;

  /** Nombre legible para la UI. */
  @Column({ nullable: true })
  etiqueta?: string;

  /** null = veto global; con valor = solo en ese bloque. */
  @Index()
  @Column({ type: 'int', nullable: true })
  bloqueId?: number | null;

  /** 'MANUAL' o 'AUTOMATICO (3 no va en la franja)'. */
  @Column({ nullable: true })
  motivo?: string;

  @Column({ default: true })
  activo!: boolean;
}
