import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface IaConfig {
  openaiApiKey: string;
  modelo: string;
  habilitado: boolean;
}

export interface IaPromptConfigDto {
  id: number;
  promptBase: string;
  promptBaseSeed: string;
  adiciones: string[];
  version: number;
}

export interface IaPromptEffectiveDto {
  text: string;
  version: number;
  lengthChars: number;
}

export type IaPromptSugerenciaEstado = 'PENDIENTE' | 'APROBADA' | 'RECHAZADA';

export interface IaPromptSugerenciaDto {
  id: number;
  texto: string;
  estado: IaPromptSugerenciaEstado;
  motivo?: string;
  origen: string;
  documentoOrigen?: { id: number; archivoNombre?: string };
  createdAt: string;
}

export type Confianza = 'ALTA' | 'MEDIA' | 'NINGUNA';

export interface ProveedorCandidato {
  id: number;
  nombre: string;
  ruc: string | null;
  score: number;
}

export interface ProductoCandidato {
  productoId: number;
  presentacionId: number | null;
  nombre: string;
  presentacionNombre: string | null;
  score: number;
}

export interface PresentacionInferidaOcrDto {
  tipo: 'UNITARIA' | 'PACK';
  cantidadPaquete: number;
  contenidoUnitario: { valor: number; unidad: string } | null;
  nombreProductoLimpio: string;
  nombrePresentacion: string;
}

export interface MatchItem {
  indice: number;
  lineaOcr: {
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    codigoProveedor: string | null;
    iva: number | null;
    unidadMedidaOcr: string | null;
    presentacionInferida: PresentacionInferidaOcrDto | null;
  };
  match: { productoId: number; presentacionId: number | null; nombre: string } | null;
  confianza: Confianza;
  candidatos: ProductoCandidato[];
  omitir: boolean;
}

export interface MatchResult {
  documentoId: number;
  documento: {
    numeroNota: string | null;
    fecha: string | null;
    tipo: string;
    moneda: string;
    total: number;
    timbrado: string | null;
  };
  proveedor: {
    textoOcr: string;
    rucOcr: string | null;
    telefonoOcr: string | null;
    match: { id: number; nombre: string } | null;
    confianza: Confianza;
    candidatos: ProveedorCandidato[];
  };
  items: MatchItem[];
}

export interface FacturaImportItem {
  id: number;
  archivoUrl: string;
  archivoNombre: string;
  archivoTipo: 'PDF' | 'IMAGE';
  estado: string;
  intentos: number;
  errorMensaje?: string;
  tokensPrompt?: number;
  tokensCompletion?: number;
  modeloUsado?: string;
  jsonValidado?: string;
  compra?: { id: number };
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class FacturaImportService {
  private get api(): any {
    return (window as any).api;
  }

  // IA Config
  iaConfigGet(): Observable<IaConfig> {
    return from(this.api.iaConfigGet() as Promise<IaConfig>);
  }
  iaConfigSet(partial: Partial<IaConfig>): Observable<{ success: boolean; config: IaConfig }> {
    return from(this.api.iaConfigSet(partial) as Promise<any>);
  }
  iaConfigTest(): Observable<{ success: boolean; message: string; latencyMs: number; modelo?: string }> {
    return from(this.api.iaConfigTest() as Promise<any>);
  }

  // IA Prompt config
  iaPromptGet(): Observable<IaPromptConfigDto> {
    return from(this.api.iaPromptGet() as Promise<IaPromptConfigDto>);
  }
  iaPromptSetAdiciones(adiciones: string[]): Observable<{ success: boolean; version: number; adiciones: string[] }> {
    return from(this.api.iaPromptSetAdiciones({ adiciones }) as Promise<any>);
  }
  iaPromptEffective(): Observable<IaPromptEffectiveDto> {
    return from(this.api.iaPromptEffective() as Promise<IaPromptEffectiveDto>);
  }

  // IA Prompt sugerencias
  iaPromptSugerenciaList(estado?: IaPromptSugerenciaEstado): Observable<IaPromptSugerenciaDto[]> {
    return from(this.api.iaPromptSugerenciaList({ estado }) as Promise<IaPromptSugerenciaDto[]>);
  }
  iaPromptSugerenciaCreate(payload: { texto: string; motivo?: string; documentoOrigenId?: number; origen?: string }): Observable<{ success: boolean; id?: number; error?: string }> {
    return from(this.api.iaPromptSugerenciaCreate(payload) as Promise<any>);
  }
  iaPromptSugerenciaAprobar(id: number): Observable<{ success: boolean; error?: string }> {
    return from(this.api.iaPromptSugerenciaAprobar({ id }) as Promise<any>);
  }
  iaPromptSugerenciaRechazar(id: number, motivo?: string): Observable<{ success: boolean; error?: string }> {
    return from(this.api.iaPromptSugerenciaRechazar({ id, motivo }) as Promise<any>);
  }
  iaPromptSugerenciaDelete(id: number): Observable<{ success: boolean; error?: string }> {
    return from(this.api.iaPromptSugerenciaDelete({ id }) as Promise<any>);
  }

  // Factura import
  pickFile(): Observable<{ canceled: boolean; filePath?: string; fileType?: 'PDF' | 'IMAGE' }> {
    return from(this.api.facturaImportPickFile() as Promise<any>);
  }
  process(filePath: string): Observable<{ success: boolean; documentoId?: number; warnings?: string[]; error?: string }> {
    return from(this.api.facturaImportProcess({ filePath }) as Promise<any>);
  }
  reprocess(documentoId: number): Observable<{ success: boolean; warnings?: string[]; error?: string }> {
    return from(this.api.facturaImportReprocess({ documentoId }) as Promise<any>);
  }
  get(documentoId: number): Observable<FacturaImportItem> {
    return from(this.api.facturaImportGet({ documentoId }) as Promise<any>);
  }
  list(payload: { page?: number; pageSize?: number; estado?: string } = {}): Observable<{ items: FacturaImportItem[]; total: number; page: number; pageSize: number }> {
    return from(this.api.facturaImportList(payload) as Promise<any>);
  }
  descartar(documentoId: number): Observable<{ success: boolean }> {
    return from(this.api.facturaImportDescartar({ documentoId }) as Promise<any>);
  }
  match(documentoId: number): Observable<MatchResult | { error: string }> {
    return from(this.api.facturaImportMatch({ documentoId }) as Promise<any>);
  }
  confirm(payload: {
    documentoId: number;
    datosCompra: any;
    itemsVinculados: Array<{
      indice: number;
      productoId: number;
      presentacionId: number | null;
      cantidad: number;
      costoUnitario: number;
      descripcionOcr: string;
      omitir: boolean;
    }>;
    aliasProveedor: { textoOcr: string; rucOcr: string | null; proveedorId: number };
  }): Observable<{ success: boolean; compraId?: number; error?: string }> {
    return from(this.api.facturaImportConfirm(payload) as Promise<any>);
  }
}
