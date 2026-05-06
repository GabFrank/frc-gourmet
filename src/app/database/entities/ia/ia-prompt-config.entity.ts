import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';

/**
 * Singleton (id=1) que guarda la configuracion de prompt usado por el OCR de facturas.
 * - promptBase: texto inmutable, viene de codigo (semilla). Si cambia entre versiones de
 *   la app, se sincroniza desde el seed al arrancar.
 * - promptAdiciones: lista de bullets que el usuario agrega manualmente desde "Configurar IA".
 *   Se concatenan al final del prompt base bajo "Reglas adicionales".
 * - version: incrementa cada vez que cambia base o adiciones — se persiste por documento
 *   procesado para trazabilidad.
 */
@Entity('ia_prompt_config')
export class IaPromptConfig extends BaseModel {
  @Column({ name: 'prompt_base', type: 'text' })
  promptBase!: string;

  @Column({ name: 'prompt_adiciones', type: 'text', default: '[]' })
  promptAdicionesJson!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'base_seed_hash', type: 'varchar', length: 64, nullable: true })
  baseSeedHash?: string;
}
