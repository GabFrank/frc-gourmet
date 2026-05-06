import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { BaseModel } from '../base.entity';
import type { DocumentoCompraImportado } from '../compras/documento-compra-importado.entity';

export enum IaPromptSugerenciaEstado {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
}

/**
 * Sugerencias de mejora al prompt OCR.
 * Las propone el usuario desde "Configurar IA" o se generan automaticamente cuando
 * un documento procesado tuvo errores recurrentes (futuro). NUNCA se aplican sin
 * aprobacion humana — al aprobarse, el texto se appendea a IaPromptConfig.promptAdiciones.
 */
@Entity('ia_prompt_sugerencias')
@Index(['estado'])
export class IaPromptSugerencia extends BaseModel {
  @Column({ type: 'text' })
  texto!: string;

  @Column({
    type: 'text',
    enum: IaPromptSugerenciaEstado,
    default: IaPromptSugerenciaEstado.PENDIENTE,
  })
  estado!: IaPromptSugerenciaEstado;

  @Column({ type: 'varchar', length: 255, nullable: true })
  motivo?: string;

  @Column({ name: 'origen', type: 'varchar', length: 30, default: 'USUARIO' })
  origen!: string;

  @ManyToOne('DocumentoCompraImportado', { nullable: true, createForeignKeyConstraints: false })
  @JoinColumn({ name: 'documento_origen_id' })
  documentoOrigen?: DocumentoCompraImportado;
}
