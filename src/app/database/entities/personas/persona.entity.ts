import { Column, Entity } from 'typeorm';
import { BaseModel } from '../base.entity';
import { DocumentoTipo } from './documento-tipo.enum';
import { PersonaTipo } from './persona-tipo.enum';

/**
 * Entity representing a person (either individual or company)
 */
@Entity('personas')
export class Persona extends BaseModel {
  @Column()
  nombre!: string;

  @Column({ nullable: true })
  telefono?: string;

  @Column({ nullable: true })
  direccion?: string;

  @Column({
    type: 'text',
    enum: DocumentoTipo,
    default: DocumentoTipo.CI
  })
  tipoDocumento!: DocumentoTipo;

  @Column()
  documento!: string;

  @Column({
    type: 'text',
    enum: PersonaTipo,
    default: PersonaTipo.FISICA
  })
  tipoPersona!: PersonaTipo;

  @Column({ default: true })
  activo!: boolean;
  
  @Column({ nullable: true })
  imageUrl?: string;
} 