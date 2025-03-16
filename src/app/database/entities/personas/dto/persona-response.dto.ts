import { DocumentoTipo } from '../documento-tipo.enum';
import { PersonaTipo } from '../persona-tipo.enum';

export class PersonaResponseDto {
  id!: string;
  nombre!: string;
  telefono?: string;
  direccion?: string;
  tipoDocumento!: DocumentoTipo;
  documento!: string;
  tipoPersona!: PersonaTipo;
  activo!: boolean;
  createdAt!: Date;
  updatedAt!: Date;
} 