import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import {
  DocumentoCompraImportadoEstado,
  DocumentoCompraImportadoTipo,
} from './documento-compra-importado-estado.enum';
import type { Compra } from './compra.entity';

@Entity('documentos_compra_importados')
@Index(['estado'])
export class DocumentoCompraImportado extends BaseModel {
  @Column({ name: 'archivo_url', type: 'varchar', length: 500 })
  archivoUrl!: string;

  @Column({ name: 'archivo_nombre', type: 'varchar', length: 255 })
  archivoNombre!: string;

  @Column({
    name: 'archivo_tipo',
    type: 'text',
    enum: DocumentoCompraImportadoTipo,
  })
  archivoTipo!: DocumentoCompraImportadoTipo;

  @Column({
    type: 'text',
    enum: DocumentoCompraImportadoEstado,
    default: DocumentoCompraImportadoEstado.PENDIENTE,
  })
  estado!: DocumentoCompraImportadoEstado;

  @Column({ name: 'json_crudo', type: 'text', nullable: true })
  jsonCrudo?: string;

  @Column({ name: 'json_validado', type: 'text', nullable: true })
  jsonValidado?: string;

  @Column({ type: 'int', default: 0 })
  intentos!: number;

  @Column({ name: 'error_mensaje', type: 'text', nullable: true })
  errorMensaje?: string;

  @Column({ name: 'tokens_prompt', type: 'int', nullable: true })
  tokensPrompt?: number;

  @Column({ name: 'tokens_completion', type: 'int', nullable: true })
  tokensCompletion?: number;

  @Column({ name: 'modelo_usado', type: 'varchar', length: 50, nullable: true })
  modeloUsado?: string;

  @Column({ name: 'prompt_version', type: 'int', nullable: true })
  promptVersion?: number;

  @ManyToOne('Compra', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'compra_id' })
  compra?: Compra;
}
