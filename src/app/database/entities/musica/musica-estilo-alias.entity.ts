import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { MusicaEstilo } from './musica-estilo.entity';

/**
 * Capa anticorrupcion entre el vocabulario de Spotify y el del local.
 *
 * Cada `valor` es un genero crudo tal como llega de `/artists/{id}`, ya
 * normalizado (sin acentos, sin espacios de mas, en mayusculas), apuntando al
 * estilo canonico que le corresponde. `ELECTRONIC` y `ELECTRONICA` son dos
 * alias del mismo estilo.
 *
 * El unique en `valor` es la pieza clave: hace IMPOSIBLE que un mismo genero
 * crudo termine mapeado a dos estilos distintos, que es exactamente como se
 * degradan estas tablas cuando se dejan sin restriccion. Y contiene el dano
 * cuando Spotify cambia su vocabulario: se corrige aca, en un solo lugar, sin
 * tocar el resto del modulo.
 */
@Entity('musica_estilo_alias')
export class MusicaEstiloAlias extends BaseModel {
  /** Genero crudo NORMALIZADO. Ver `normalizarGenero()` en el servicio. */
  @Index({ unique: true })
  @Column()
  valor!: string;

  @Index()
  @ManyToOne(() => MusicaEstilo, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'estilo_id' })
  estilo!: MusicaEstilo;
}
