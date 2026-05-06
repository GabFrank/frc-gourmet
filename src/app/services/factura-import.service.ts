import { Injectable } from '@angular/core';
import { Observable, from } from 'rxjs';

export interface IaConfig {
  openaiApiKey: string;
  modelo: string;
  habilitado: boolean;
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

export interface MatchItem {
  indice: number;
  lineaOcr: {
    descripcion: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
    codigoProveedor: string | null;
    iva: number | null;
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
