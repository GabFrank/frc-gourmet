import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Un momento del dia con su perfil musical: "Almuerzo buffet, 11:00-14:00,
 * energia 2, bossa y sunset calmo".
 *
 * La grilla semanal del local es el conjunto de estos bloques. Cada bloque se
 * materializa cada dia en tres playlists de Spotify (suave/normal/movido).
 */
@Entity('musica_bloques')
export class BloqueProgramacion extends BaseModel {
  /** 0=domingo .. 6=sabado. -1 = aplica a todos los dias. */
  @Index()
  @Column({ type: 'int' })
  diaSemana!: number;

  /** UPPERCASE: 'ALMUERZO BUFFET', 'SOBREMESA', 'CENA'. */
  @Column()
  nombre!: string;

  /** 'HH:MM' hora local. */
  @Column()
  horaDesde!: string;

  @Column()
  horaHasta!: string;

  /** 1 (muy tranquilo) .. 5 (muy movido). */
  @Column({ type: 'int', default: 3 })
  energia!: number;

  /** Volumen objetivo del device, 0..100. Se calibra en el local. */
  @Column({ type: 'int', default: 50 })
  volumen!: number;

  @Column({ type: 'simple-json', nullable: true })
  generosPreferidos?: string[];

  @Column({ type: 'simple-json', nullable: true })
  generosEvitar?: string[];

  @Column({ type: 'float', nullable: true })
  bpmMin?: number;

  @Column({ type: 'float', nullable: true })
  bpmMax?: number;

  /**
   * Valencia minima: implementa "nada triste". Se baja en los bloques chill,
   * donde algo de melancolia es aceptable.
   */
  @Column({ type: 'float', nullable: true })
  valenciaMin?: number;

  /**
   * Texto libre del dueno sobre este momento ("los domingos al mediodia viene
   * mucha familia con chicos"). Va LITERAL al prompt del planificador: es el
   * canal por donde entra el conocimiento que ningun parametro captura.
   */
  @Column({ type: 'text', nullable: true })
  notas?: string;

  /**
   * Cuantos temas del mismo artista se permiten en la playlist de este bloque.
   *
   * Tres estados sobre una sola columna:
   *   `null` = heredar el global (`avanzado.maxPorArtistaDefault`)
   *   `0`    = sin limite
   *   `N>0`  = tope propio de este bloque
   *
   * El `0` es centinela y no "cero temas por artista" (que no tendria sentido
   * como cupo). Hace falta porque `undefined` —que era como se representaba
   * "heredar"— no sobrevive: TypeORM devuelve `null` al leer la columna, y
   * ademas se pierde al serializar tanto por IPC como por HTTP en modo cliente.
   * Sin esto, todo bloque leido de la BD parecia "sin limite" y el tope global
   * no se aplicaba nunca: un artista podia coparse el bloque entero.
   *
   * Es por bloque y no global a proposito: en un bloque de covers bossa varios
   * temas del mismo interprete son lo esperado, mientras que en la noche de
   * rock repetir artista es justamente el problema a evitar.
   */
  @Column({ type: 'int', nullable: true })
  maxPorArtista?: number | null;

  /** Aunque tenga cupo, no poner dos temas del mismo artista seguidos. */
  @Column({ default: true })
  evitarArtistaConsecutivo!: boolean;

  /**
   * Cuanto mas larga que el bloque se genera la playlist. `null` = usa el
   * valor global. Sirve para bloques donde interesa mas variedad.
   */
  @Column({ type: 'float', nullable: true })
  factorDuracion?: number | null;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
