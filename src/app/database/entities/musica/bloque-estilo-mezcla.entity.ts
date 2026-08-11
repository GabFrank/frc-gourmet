import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import { BloqueProgramacion } from './bloque-programacion.entity';
import { MusicaEstilo } from './musica-estilo.entity';

/**
 * "En el almuerzo quiero 50% bossa y 20% pagode": la receta de un bloque.
 *
 * Tabla propia y no un JSON dentro del bloque, por tres razones concretas:
 *
 *   - El calculo de deficit ("cuantos temas me faltan de cada estilo en toda la
 *     semana") es un JOIN, no un escaneo de 31 blobs.
 *   - Renombrar un estilo es un UPDATE de una fila, no reescribir 31 JSON.
 *   - Borrar un estilo en uso lo dice la FK, en vez de dejar JSON podrido
 *     apuntando a un nombre que ya no existe.
 *
 * Los porcentajes NO tienen que sumar 100: lo que falte se completa con el
 * resto del repertorio que pase los filtros del bloque. Sumar menos de 100 es
 * una forma valida de decir "quiero bossa y pagode, y el resto me da igual".
 */
@Entity('musica_bloque_estilo_mezcla')
@Index(['bloque', 'estilo'], { unique: true })
export class BloqueEstiloMezcla extends BaseModel {
  @ManyToOne(() => BloqueProgramacion, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'bloque_id' })
  bloque!: BloqueProgramacion;

  @ManyToOne(() => MusicaEstilo, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'estilo_id' })
  estilo!: MusicaEstilo;

  /** 0..100. Porcentaje de la DURACION del bloque, no de la cantidad de temas. */
  @Column({ type: 'int', default: 0 })
  porcentaje!: number;
}
