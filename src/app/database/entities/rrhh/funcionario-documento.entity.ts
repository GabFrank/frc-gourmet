import { Column, Entity, ManyToOne, JoinColumn } from 'typeorm';
import { BaseModel } from '../base.entity';
import { Funcionario } from './funcionario.entity';
import { FuncionarioDocumentoTipo } from './funcionario-documento-tipo.enum';

/**
 * Metadata de documento del funcionario. El archivo binario se guarda en
 * filesystem (userData/funcionario-documentos/{funcionarioId}/) siguiendo
 * el patron de image-handler.utils.ts.
 */
@Entity('funcionario_documentos')
export class FuncionarioDocumento extends BaseModel {
  @ManyToOne(() => Funcionario)
  @JoinColumn({ name: 'funcionario_id' })
  funcionario!: Funcionario;

  @Column({
    type: 'text',
    enum: FuncionarioDocumentoTipo,
    default: FuncionarioDocumentoTipo.OTRO,
  })
  tipo!: FuncionarioDocumentoTipo;

  @Column({ name: 'nombre_archivo' })
  nombreArchivo!: string;

  @Column({ name: 'ruta_relativa' })
  rutaRelativa!: string;

  @Column({ name: 'mime_type', nullable: true })
  mimeType?: string;

  @Column({ name: 'tamano_bytes', type: 'integer', nullable: true })
  tamanoBytes?: number;

  @Column({ name: 'fecha_subida', type: 'datetime' })
  fechaSubida!: Date;

  @Column({ type: 'date', nullable: true })
  vencimiento?: Date;

  @Column({ nullable: true })
  observacion?: string;
}
