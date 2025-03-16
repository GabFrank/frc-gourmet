import { DocumentoTipo } from '../documento-tipo.enum';
import { PersonaTipo } from '../persona-tipo.enum';

export class CreatePersonaDto {
  nombre!: string;
  telefono?: string;
  direccion?: string;
  tipoDocumento!: DocumentoTipo;
  documento!: string;
  tipoPersona!: PersonaTipo;
  activo: boolean = true;
} 