import { Column, Entity, Index } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * El vocabulario de estilos del local. Es la unica fuente de verdad sobre
 * "que suena" y todo el modulo habla contra este catalogo.
 *
 * POR QUE EXISTE: el modulo tenia cuatro vocabularios que no se hablaban entre
 * si. Los tracks traian generos de Spotify (`MPB`, `ELECTRONIC`, `ELECTRÓNICA`
 * — de ARTISTA, no de tema, 59 valores con duplicados por idioma y acento); la
 * grilla traia nombres inventados por el LLM al interpretar el brief
 * (`BOSSA N' ROSES`, `ELECTRÓNICA SUNSET`, cero coincidencias con el pool); los
 * vetos comparaban strings sueltos; y el descubrimiento usaba los de la grilla.
 *
 * Consecuencias que esto arregla, las dos reales y verificadas:
 *
 *   1. El planner no podia respetar el estilo de un bloque, porque los nombres
 *      de la grilla no existian en ningun track. Configurar "almuerzo: bossa"
 *      no tenia ningun efecto sobre lo que sonaba.
 *   2. El veto por genero se hacia con `includes()`, asi que vetar `FUNK`
 *      mataba tambien al funk americano por culpa de `FUNK BRASILEIRO`.
 *
 * Ver `MusicaEstiloAlias` para la capa que traduce el vocabulario de Spotify a
 * este.
 */
@Entity('musica_estilos')
export class MusicaEstilo extends BaseModel {
  /** UPPERCASE y unico: 'BOSSA / MPB', 'PAGODE', 'ELECTRONICA CHILL'. */
  @Index({ unique: true })
  @Column()
  nombre!: string;

  /**
   * Que agrupa este estilo, en una frase.
   *
   * No es solo un recordatorio para el dueno: viaja al prompt del etiquetador y
   * es lo que le permite al modelo elegir entre dos estilos que comparten
   * genero ("bossa covers" y "bossa clasica" son ambos BOSSA NOVA).
   */
  @Column({ type: 'text', nullable: true })
  descripcion?: string | null;

  @Column({ type: 'int', default: 0 })
  orden!: number;

  @Column({ default: true })
  activo!: boolean;
}
